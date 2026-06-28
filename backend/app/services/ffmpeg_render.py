"""
ffmpeg_render.py — Local FFmpeg video renderer.
Pipeline: trim → scale/crop (zoom+pan) → speed → fade → color grade → xfade concat
No external API. Uses FFmpeg already installed in the Docker container.
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

# Cinematic color grade filters
COLOR_GRADES = {
    # Warm golden — luxury resort, golden hour
    "warm": (
        "curves=r='0/0 0.5/0.58 1/1':g='0/0 0.5/0.50 1/0.95':b='0/0 0.5/0.40 1/0.82',"
        "eq=saturation=1.25:brightness=0.02"
    ),
    # Teal-Orange — Hollywood cinematic look
    "teal_orange": (
        "curves=r='0/0 0.25/0.30 0.75/0.82 1/1':"
              "g='0/0 0.5/0.47 1/0.88':"
              "b='0/0 0.25/0.38 0.5/0.55 1/0.78',"
        "eq=saturation=1.35"
    ),
    # Vibrant — party, energetic, fun
    "vibrant": "eq=saturation=1.55:contrast=1.12:brightness=0.03",
    # Moody — dramatic, emotional
    "moody": "curves=all='0/0.05 0.5/0.45 1/0.90',eq=saturation=0.78",
    # Fresh blue — pool, beach, water
    "fresh": (
        "curves=b='0/0 0.5/0.58 1/1':g='0/0 0.5/0.52 1/0.95',"
        "eq=saturation=1.30:brightness=0.02"
    ),
    # Soft romantic
    "romantic": (
        "curves=r='0/0 0.5/0.60 1/1':b='0/0 0.5/0.38 1/0.78',"
        "eq=saturation=1.15:brightness=0.03"
    ),
}

XFADE_MAP = {
    "fade": "fade", "dissolve": "dissolve",
    "wipeleft": "wipeleft", "wiperight": "wiperight",
    "wipeup": "wipeup", "wipedown": "wipedown",
    "slideleft": "slideleft", "slideright": "slideright",
    "slideup": "slideup", "slidedown": "slidedown",
    "circleopen": "circleopen", "circleclose": "circleclose",
    "pixelize": "pixelize", "hard_cut": "fade",
}


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
    # Default: warm golden — works great for pool villa luxury
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


async def _process_clip(src: str, clip: dict, out_w: int, out_h: int, grade: str, tmp: str, idx: int) -> str:
    """Trim → scale/zoom → speed → fade → color grade a single clip."""
    dest = os.path.join(tmp, f"seg_{idx:02d}.mp4")

    ts     = float(clip["trim_start"])
    te     = float(clip["trim_end"])
    dur    = te - ts
    speed  = max(0.5, min(2.0, float(clip.get("speed", 1.0))))
    zoom   = max(0, min(10, int(clip.get("zoom", 0))))   # only zoom-in (0-10)
    pan    = clip.get("pan") or None
    fade_i = max(0.3, float(clip.get("fade_in",  0.4)))
    fade_o = max(0.3, float(clip.get("fade_out", 0.4)))

    adj_dur = dur / speed  # duration after speed change

    # Zoom scale factor: zoom=0→1.0x, zoom=10→1.5x
    scale_f = 1.0 + zoom * 0.05
    sw = int(out_w * scale_f)
    sh = int(out_h * scale_f)
    # Force even dimensions (required by libx264)
    sw = sw + (sw % 2)
    sh = sh + (sh % 2)

    # Default crop: center
    cx = (sw - out_w) // 2
    cy = (sh - out_h) // 2
    # Shift crop for pan direction
    if zoom > 0 and pan:
        if "right"  in pan: cx = sw - out_w
        elif "left" in pan: cx = 0
        if "bottom" in pan: cy = sh - out_h
        elif "top"  in pan: cy = 0

    vf: list[str] = []

    # 1. Scale to cover output at zoom level
    vf.append(f"scale={sw}:{sh}:force_original_aspect_ratio=increase")
    # Ensure exact even dimensions after force_original_aspect_ratio
    vf.append(f"crop={out_w}:{out_h}:{cx}:{cy}")

    # 2. Speed change
    if abs(speed - 1.0) > 0.05:
        vf.append(f"setpts={1.0/speed:.4f}*PTS")

    # 3. Fade in / out (based on adjusted duration)
    fade_o_st = max(0.1, adj_dur - fade_o)
    vf.append(f"fade=t=in:st=0:d={fade_i:.2f}")
    vf.append(f"fade=t=out:st={fade_o_st:.2f}:d={fade_o:.2f}")

    # 4. Color grade
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
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-an",
        dest,
    ]

    logger.info(f"[FFR] clip {idx}: zoom={zoom} pan={pan} speed={speed} grade={grade} {dur:.1f}s → {adj_dur:.1f}s")
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg clip {idx} error: {stderr.decode()[-500:]}")

    return dest


async def _concat(segs: list[str], clips: list[dict], tmp: str) -> str:
    """Concatenate processed segments with xfade transitions."""
    dest = os.path.join(tmp, "output.mp4")

    if len(segs) == 1:
        shutil.copy(segs[0], dest)
        return dest

    # Get actual durations of processed segments
    durs = [await _probe_duration(s) for s in segs]

    inputs: list[str] = []
    for s in segs:
        inputs += ["-i", s]

    td = 1.0  # transition duration
    prev = "[0:v]"
    parts: list[str] = []
    offset = durs[0] - td

    for i in range(1, len(segs)):
        style  = clips[i - 1].get("transition", "fade")
        xfade  = XFADE_MAP.get(style, "fade")
        label  = "[vout]" if i == len(segs) - 1 else f"[v{i}]"
        parts.append(
            f"{prev}[{i}:v]xfade=transition={xfade}:duration={td}:offset={offset:.3f}{label}"
        )
        prev = label
        if i < len(segs) - 1:
            offset += durs[i] - td

    fc = ";".join(parts)

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", fc,
        "-map", "[vout]",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-an",
        dest,
    ]

    logger.info(f"[FFR] concat {len(segs)} segments")
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg concat error: {stderr.decode()[-500:]}")

    return dest


async def render_with_ffmpeg(
    plan: dict,
    clip_paths: list[str],
    resolution: str,
    style_prompt: str,
    tmp_dir: str,
) -> str:
    """
    Full FFmpeg pipeline.
    Returns local path to the final MP4 file.
    """
    out_w, out_h = RESOLUTIONS.get(resolution, (1080, 1920))
    grade  = detect_grade(style_prompt)
    clips  = plan.get("clips", [])

    logger.info(f"[FFR] {len(clips)} clips | {out_w}x{out_h} | grade={grade}")

    segs = []
    for i, clip in enumerate(clips):
        src = clip_paths[clip["source_index"]]
        seg = await _process_clip(src, clip, out_w, out_h, grade, tmp_dir, i)
        segs.append(seg)

    final = await _concat(segs, clips, tmp_dir)
    logger.info(f"[FFR] done → {final}")
    return final
