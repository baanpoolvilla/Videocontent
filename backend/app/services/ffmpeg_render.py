"""
ffmpeg_render.py — Local FFmpeg video renderer.
Pipeline: trim → scale-to-cover → animated-crop (Ken Burns) → speed → fade (first/last only) → color grade → xfade concat
"""
import asyncio
import json
import logging
import os
import shutil

logger = logging.getLogger(__name__)

RESOLUTIONS = {
    "portrait":  (1080, 1920),
    "landscape": (1920, 1080),
    "square":    (1080, 1080),
}

COLOR_GRADES = {
    "warm": (
        "colorbalance=rs=0.08:rm=0.05:rh=0.02:gs=0:gm=0:gh=0:bs=-0.10:bm=-0.06:bh=-0.02,"
        "eq=saturation=1.20:contrast=1.05:brightness=0.01,"
        "vignette=PI/5"
    ),
    "teal_orange": (
        "colorbalance=rs=0.12:rm=0.10:rh=0.05:gs=-0.02:gm=-0.02:gh=0:bs=-0.08:bm=-0.04:bh=0.06,"
        "eq=saturation=1.30:contrast=1.08,"
        "vignette=PI/5"
    ),
    # vibrant: warm punch — slight orange tones + natural saturation
    "vibrant": (
        "colorbalance=rs=0.06:rm=0.04:rh=0.02:gs=0.02:gm=0.01:gh=0:bs=-0.06:bm=-0.04:bh=-0.01,"
        "eq=saturation=1.45:contrast=1.15:brightness=0.03,"
        "vignette=PI/5"
    ),
    "moody": (
        "colorbalance=rs=-0.03:rm=-0.02:rh=0:gs=-0.02:gm=-0.01:gh=0:bs=0.02:bm=0.02:bh=0,"
        "eq=saturation=0.80:contrast=1.28:brightness=-0.04,"
        "vignette=PI/3.5"
    ),
    "fresh": (
        "colorbalance=rs=-0.02:rm=0:rh=0:gs=0.02:gm=0.02:gh=0:bs=0.08:bm=0.06:bh=0.04,"
        "eq=saturation=1.30:contrast=1.05:brightness=0.02,"
        "vignette=PI/5"
    ),
    "romantic": (
        "colorbalance=rs=0.06:rm=0.04:rh=0.02:gs=0:gm=0:gh=0:bs=-0.08:bm=-0.05:bh=-0.02,"
        "eq=saturation=1.10:contrast=1.03:brightness=0.03,"
        "vignette=PI/6"
    ),
}

XFADE_MAP = {
    "fade": "fade", "fadewhite": "fadewhite", "dissolve": "dissolve",
    "wipeleft": "wipeleft", "wiperight": "wiperight",
    "wipeup": "wipeup", "wipedown": "wipedown",
    "slideleft": "slideleft", "slideright": "slideright",
    "slideup": "slideup", "slidedown": "slidedown",
    "circleopen": "circleopen", "circleclose": "circleclose",
    "pixelize": "pixelize", "zoomin": "zoomin",
    "hard_cut": "fadewhite",  # party hard_cut → white flash instead of instant cut
}

# Default drift directions for clips without pan (alternated by index)
_DEFAULT_PANS = ["right", "left", "bottom", "top", "top-right", "bottom-left"]


def detect_grade(style_prompt: str) -> str:
    s = style_prompt.lower()
    if any(w in s for w in ["teal", "orange", "cinematic", "ซีเนมา", "hollywood", "film"]):
        return "teal_orange"
    if any(w in s for w in ["สนุก", "party", "เฮฮา", "energetic", "vibrant", "punchy", "bright", "โปรโมชัน"]):
        return "vibrant"
    if any(w in s for w in ["moody", "dark", "มืด", "dramatic", "emotional"]):
        return "moody"
    if any(w in s for w in ["โรแมนติก", "romantic", "soft", "นุ่ม"]):
        return "romantic"
    if any(w in s for w in ["pool", "สระ", "ทะเล", "sea", "beach", "chill", "ชิลล์", "fresh", "สดชื่น", "nature"]):
        return "fresh"
    return "warm"


async def _probe_duration(path: str) -> float:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, _ = await proc.communicate()
    try:
        return float(json.loads(out.decode())["format"]["duration"])
    except Exception:
        return 10.0


def _build_ken_burns(out_w: int, out_h: int, pan: str, zoom: int, dur: float, sw: int, sh: int) -> str:
    """
    True Ken Burns via zoompan: zoom-IN (zoom>0) or zoom-OUT (zoom<0) + pan.
    Input must already be scaled to sw×sh (scale-to-cover). Output is out_w×out_h.
    """
    n = max(2, int(dur * 30))
    extra = max(1.0, 1.0 + abs(zoom) * 0.04)
    step = (extra - 1.0) / max(n - 1, 1)
    travel = max(n - 1, 1)

    if zoom >= 0:   # zoom IN: 1.0 → extra
        z = f"min(zoom+{step:.8f},{extra:.5f})"
    else:           # zoom OUT: extra → 1.0
        z = f"if(eq(on,1),{extra:.5f},max(zoom-{step:.8f},1.001))"

    max_tx = max(1.0, (sw - out_w) / 2)
    max_ty = max(1.0, (sh - out_h) / 2)
    bx = f"({sw}/2-{out_w}/zoom/2)"
    by = f"({sh}/2-{out_h}/zoom/2)"

    if "right" in pan:
        px = f"-{max_tx:.1f}+on*{max_tx*2/travel:.5f}"
    elif "left" in pan:
        px = f"{max_tx:.1f}-on*{max_tx*2/travel:.5f}"
    else:
        px = "0"

    if "bottom" in pan:
        py = f"-{max_ty:.1f}+on*{max_ty*2/travel:.5f}"
    elif "top" in pan:
        py = f"{max_ty:.1f}-on*{max_ty*2/travel:.5f}"
    else:
        py = "0"

    x = f"max(0,min({sw}-{out_w}/zoom,{bx}+({px})))"
    y = f"max(0,min({sh}-{out_h}/zoom,{by}+({py})))"

    return f"zoompan=z='{z}':x='{x}':y='{y}':d={n}:s={out_w}x{out_h}:fps=30"


async def _process_clip(
    src: str, clip: dict, out_w: int, out_h: int,
    grade: str, tmp: str, idx: int,
    is_first: bool = False, is_last: bool = False,
) -> str:
    """Trim → scale-to-cover → animated Ken Burns crop → speed → fade(first/last) → color grade."""
    dest = os.path.join(tmp, f"seg_{idx:02d}.mp4")

    ts    = float(clip["trim_start"])
    te    = float(clip["trim_end"])
    dur   = te - ts
    speed = max(0.5, min(2.0, float(clip.get("speed", 1.0))))
    zoom  = max(-10, min(10, int(clip.get("zoom", 0))))
    pan   = clip.get("pan") or None

    adj_dur = dur / speed

    # Scale to cover — extra headroom for zoompan to work within
    min_scale = 1.40 if grade == "vibrant" else 1.20
    scale_f = max(min_scale, 1.0 + abs(zoom) * 0.06)
    sw = int(out_w * scale_f)
    sh = int(out_h * scale_f)
    sw += sw % 2
    sh += sh % 2

    effective_pan = pan or _DEFAULT_PANS[idx % len(_DEFAULT_PANS)]

    vf: list[str] = []

    # 1. Speed change first (so zoompan sees correct frame count)
    if abs(speed - 1.0) > 0.05:
        vf.append(f"setpts={1.0/speed:.4f}*PTS")

    # 2. Scale to cover (provides headroom for zoompan)
    vf.append(f"scale={sw}:{sh}:force_original_aspect_ratio=increase,pad={sw}:{sh}:(ow-iw)/2:(oh-ih)/2")

    # 3. True Ken Burns: animated zoom-in or zoom-out + pan
    vf.append(_build_ken_burns(out_w, out_h, effective_pan, zoom, adj_dur, sw, sh))

    # 4. Fade — ONLY on first clip (fade-in) and last clip (fade-out).
    #    Intermediate clips rely on xfade transitions — per-clip fades
    #    cause a double-fade artifact that makes transitions look choppy.
    fade_i = max(0.4, float(clip.get("fade_in",  0.5)))
    fade_o = max(0.4, float(clip.get("fade_out", 0.5)))
    if is_first:
        vf.append(f"fade=t=in:st=0:d={fade_i:.2f}")
    if is_last:
        fo_start = max(0.1, adj_dur - fade_o - 0.1)
        vf.append(f"fade=t=out:st={fo_start:.2f}:d={fade_o:.2f}")

    # 5. Color grade
    gf = COLOR_GRADES.get(grade, "")
    if gf:
        vf.append(gf)

    vf_str = ",".join(vf)

    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{ts:.3f}",
        "-i", src,
        "-t", f"{dur:.3f}",
        "-vf", vf_str,
        "-r", "30",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-an",
        dest,
    ]

    logger.info(
        f"[FFR] clip {idx}: {os.path.basename(src)} zoom={zoom}(x{scale_f:.2f}) "
        f"pan={effective_pan} speed={speed} grade={grade} {dur:.1f}s→{adj_dur:.1f}s"
    )
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg clip {idx} failed:\n{stderr.decode()[-800:]}")

    return dest


async def _concat(segs: list[str], clips: list[dict], tmp: str) -> str:
    """Concatenate processed segments with xfade transitions."""
    dest = os.path.join(tmp, "output.mp4")

    if len(segs) == 1:
        shutil.copy(segs[0], dest)
        return dest

    durs = [await _probe_duration(s) for s in segs]

    # Transition duration: 40% of shortest clip, clamp 0.5–1.2s
    min_dur = min(durs)
    td = round(min(1.2, max(0.5, min_dur * 0.40)), 2)

    inputs: list[str] = []
    for s in segs:
        inputs += ["-i", s]

    prev   = "[0:v]"
    parts: list[str] = []
    offset = max(0.1, durs[0] - td)

    for i in range(1, len(segs)):
        style = clips[i - 1].get("transition", "fade")
        xfade = XFADE_MAP.get(style, "fade")
        label = "[vout]" if i == len(segs) - 1 else f"[v{i}]"
        parts.append(
            f"{prev}[{i}:v]xfade=transition={xfade}:duration={td}:offset={offset:.3f}{label}"
        )
        prev = label
        if i < len(segs) - 1:
            offset += max(0.1, durs[i] - td)

    fc = ";".join(parts)

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", fc,
        "-map", "[vout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "26",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-an",
        dest,
    ]

    logger.info(f"[FFR] concat {len(segs)} segs | td={td}s")
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg concat failed:\n{stderr.decode()[-800:]}")

    return dest


async def render_with_ffmpeg(
    plan: dict,
    clip_paths: list[str],
    resolution: str,
    style_prompt: str,
    tmp_dir: str,
) -> str:
    out_w, out_h = RESOLUTIONS.get(resolution, (1080, 1920))
    grade  = detect_grade(style_prompt)
    clips  = plan.get("clips", [])
    n      = len(clips)

    logger.info(f"[FFR] {n} clips | {out_w}x{out_h} | grade={grade}")

    segs = []
    for i, clip in enumerate(clips):
        src = clip_paths[clip["source_index"]]
        seg = await _process_clip(
            src, clip, out_w, out_h, grade, tmp_dir, i,
            is_first=(i == 0),
            is_last=(i == n - 1),
        )
        segs.append(seg)

    final = await _concat(segs, clips, tmp_dir)
    logger.info(f"[FFR] complete → {final}")
    return final
