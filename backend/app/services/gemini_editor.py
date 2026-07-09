"""
gemini_editor.py — Gemini-powered video editorial planner.
Extracts sample frames from each clip, sends to Gemini Vision,
returns a structured editorial plan (clip order, trim, zoom, pan, transition,
speed, color correction, fade-in/out, and optional title overlay).
Uses google-generativeai (already in requirements.txt).
"""
import asyncio
import base64
import json
import logging
import os
import re
import tempfile
from io import BytesIO

import google.generativeai as genai
import google.api_core.exceptions
import openai
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_TRANSITIONS = {
    "fade", "fadewhite", "dissolve",
    "wipeleft", "wiperight", "wipeup", "wipedown",
    "slideleft", "slideright", "slideup", "slidedown",
    "circleopen", "circleclose",
    "pixelize", "zoomin",
    "hard_cut",
}

_DIRECTOR_SYSTEM = """You are a professional video editor and colorist.
You will receive sample frames from {n} raw video clips and a style brief.
Produce an editorial plan: choose which clips to use, order, trim section,
transition, camera motion, speed, color correction, and fade timing.

CLIENT BRIEF: {style_prompt}
Clip durations (seconds): {durations}
Silent/dead-air stretches detected in the source audio (seconds, per clip): {silence_info}

Return ONLY a valid JSON object — no markdown, no code fences, no explanation.
Schema:
{{
  "clips": [
    {{
      "source_index":  <int 0-based>,
      "trim_start":    <float seconds>,
      "trim_end":      <float seconds>,
      "zoom":          <int -10 to 10; positive=zoom-in, negative=zoom-out, 0=none>,
      "pan":           <string or null: "left","right","top","bottom","top-left","top-right","bottom-left","bottom-right">,
      "transition":    <string: one of {transitions}>,
      "speed":         <float 0.5-2.0>,
      "fade_in":       <float 0-2.0>,
      "fade_out":      <float 0-2.0>,
      "correction": {{
        "brightness":  <int -3 to 3>,
        "contrast":    <int -3 to 3>,
        "saturation":  <int -3 to 3>
      }}
    }}
  ],
  "title": {{
    "text":     <string or null>,
    "position": <"top" | "bottom">,
    "size":     <int 20-80>
  }}
}}

RULES:

1. SHOT TYPE — Identify each clip from the frames, apply matching camera rule:
   - WIDE/ESTABLISHING (full scene, small subjects, landscape/room overview):
     zoom IN (+4 to +8), pan slowly across scene. Opens the video well.
   - MEDIUM (subjects waist-up, 2-3 people, half-body):
     gentle zoom IN (+2 to +5), pan toward dominant subject or motion direction.
   - CLOSE-UP (face fills frame, hands, food detail, object detail):
     zoom OUT (-3 to -6) to breathe, subtle pan. Never zoom IN on already-tight shot.
   - ACTION (fast movement, dancing, splashing, sport, running):
     zoom IN aggressively (+6 to +10), pan in the direction of motion.
   Pan TOWARD where subjects face or move — never pan against eye flow.

2. SHOT SEQUENCING — Alternate shot types, never same type 3+ in a row.
   Ideal: wide → medium → close-up → action → medium → wide
   Open with establishing shot. End with strongest emotional or action moment.
   NEVER end with setup, static, empty, or boring shot.

3. SHOT QUALITY — Reject only technically unusable shots:
   completely blurry/unrecognizable, fully black, totally blown-out,
   subject fully out of frame, people setting up/arranging venue,
   someone walking away with full back to camera and nothing else interesting.
   Keep moody, dramatic, backlit, or imperfect-exposure shots — content matters more than perfect light.

4. {clip_mode_instruction}

5. {clip_count_instruction}

6. TRANSITIONS:
   - energetic/party → fadewhite or hard_cut 70%+ of transitions. Mix in wipeleft/wiperight/zoomin.
   - elegant/calm → fade, dissolve, circleopen
   - tour/property → slideright, slideleft, fade

7. SPEED: Default 1.0. Luxury/cinematic → 0.8. Party/energetic → 1.1–1.3 (faster = more energy).
   ACTION clips (dancing, splashing, running) can go up to 1.5.

8. CORRECTION (range -3 to 3):
   - luxury/golden → brightness +1, contrast +2, saturation +2
   - vibrant/party → saturation +3, contrast +2, brightness +1
   - moody/dramatic → contrast +3, saturation -1
   - neutral/pro → all 0

9. FADE: fade_in 0.3 and fade_out 0.3 for party/energetic. Others: 0.5.
   Only the very first clip needs fade_in and last clip needs fade_out — middle clips leave at 0.

10. ZOOM & PAN for energetic/party style: zoom MUST be non-zero on every clip (zoom=0 forbidden).
    Use zoom 6–10 (IN) for ACTION and CLOSE-UP shots. Use zoom -5 to -8 (OUT) for WIDE shots.
    Alternate zoom direction every clip (in→out→in→out). Pan must never be null.

11. TITLE: Add only for tour or promotional styles, null otherwise.

12. SILENCE: Prefer trim_start/trim_end ranges that AVOID the detected silent/dead-air
    stretches listed above — a segment with no dialogue/action happening is usually a boring
    moment even if the frame looks fine. Only select inside a silent stretch if there's no
    better option for that clip.

13. Return ONLY the JSON object."""


async def _detect_silence_ranges(path: str, noise_db: str = "-30dB", min_dur: float = 0.5) -> list[tuple[float, float]]:
    """Run FFmpeg's silencedetect on a source clip's audio track and return [(start, end), ...]
    ranges quiet enough to likely be dead air — fed to the editorial AI so it prefers picking
    segments with actual dialogue/action over a silent, probably-boring stretch. Returns []
    on any failure (e.g. the clip has no audio track) rather than raising, since this is an
    advisory signal, not a hard requirement."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-i", path, "-af", f"silencedetect=noise={noise_db}:d={min_dur}",
            "-f", "null", "-",
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        log = stderr.decode(errors="ignore")

        ranges: list[tuple[float, float]] = []
        start: float | None = None
        for line in log.splitlines():
            if "silence_start" in line:
                try:
                    start = float(line.rsplit(":", 1)[1].strip())
                except (ValueError, IndexError):
                    start = None
            elif "silence_end" in line and start is not None:
                try:
                    end_str = line.split("silence_end:")[1].split("|")[0].strip()
                    ranges.append((start, float(end_str)))
                except (ValueError, IndexError):
                    pass
                start = None
        return ranges
    except Exception as e:
        logger.warning(f"[EDITOR] silence detection failed for {os.path.basename(path)}: {e}")
        return []


async def _get_duration(path: str) -> float:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        return float(json.loads(stdout.decode())["format"]["duration"])
    except Exception:
        return 10.0


async def _extract_frames(path: str, n: int = 5) -> list[Image.Image]:
    duration = await _get_duration(path)
    timestamps: list[float] = []

    # Long clips (15s+): use scene detection to find action moments
    if duration >= 15.0:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-i", path,
            "-vf", "select='gt(scene,0.25)',showinfo",
            "-vsync", "vfr", "-f", "null", "-",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        for line in stderr.decode(errors="ignore").split("\n"):
            if "pts_time:" in line:
                try:
                    t = float(line.split("pts_time:")[1].split()[0])
                    if 0 < t < duration:
                        timestamps.append(t)
                except Exception:
                    pass
        timestamps.sort()
        # Keep up to n evenly-spread scene timestamps
        if len(timestamps) > n:
            step = len(timestamps) / n
            timestamps = [timestamps[int(i * step)] for i in range(n)]

    # Fallback / short clips: equally-spaced
    if len(timestamps) < 3:
        timestamps = [duration * (i + 0.5) / n for i in range(n)]

    frames: list[Image.Image] = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, t in enumerate(timestamps):
            out = os.path.join(tmp, f"f{i}.jpg")
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y",
                "-ss", f"{t:.3f}", "-i", path,
                "-frames:v", "1", "-q:v", "4",
                out,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.communicate()
            if os.path.exists(out):
                try:
                    img = Image.open(out).copy()
                    img.thumbnail((480, 480))
                    frames.append(img)
                except Exception:
                    pass
    return frames


async def _build_plan_openai(
    prompt: str,
    clip_paths: list[str],
    durations: list[float],
    all_frames: list[list[Image.Image]],
    loop: asyncio.AbstractEventLoop,
) -> str:
    """OpenAI GPT-4o fallback when Gemini quota is exceeded."""
    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    content: list = [{"type": "text", "text": prompt}]
    for i, frames in enumerate(all_frames):
        content.append({"type": "text", "text": f"\n\n--- [Clip {i}] duration={durations[i]}s ---"})
        for img in frames:
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=75)
            b64 = base64.b64encode(buf.getvalue()).decode()
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"},
            })

    response = await loop.run_in_executor(
        None,
        lambda: client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": content}],
            temperature=0.3,
            max_tokens=4096,
            response_format={"type": "json_object"},
        ),
    )
    return response.choices[0].message.content or "{}"


async def build_editorial_plan(clip_paths: list[str], style_prompt: str, clip_mode: str = "raw") -> dict:
    """
    clip_paths   : local temp paths to uploaded video clips
    style_prompt : free-text brief from the user (Thai or English)
    Returns dict with "clips" list, "durations" list, and optional "title" dict.
    """
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")

    durations = []
    for p in clip_paths:
        d = await _get_duration(p)
        durations.append(round(d, 2))

    silence_by_clip = await asyncio.gather(*(_detect_silence_ranges(p) for p in clip_paths))
    if any(silence_by_clip):
        silence_info = "; ".join(
            f"clip{i}=[{', '.join(f'{s:.1f}-{e:.1f}s' for s, e in ranges)}]"
            for i, ranges in enumerate(silence_by_clip) if ranges
        )
    else:
        silence_info = "none detected"

    transitions_str = ", ".join(sorted(ALLOWED_TRANSITIONS))

    is_party = any(w in style_prompt.lower() for w in [
        "party", "เฮฮา", "สนุก", "energetic", "fun", "ปาร์ตี้", "เฉลิมฉลอง"
        # "vibrant" and "punchy" removed — color words, not party indicators; promo uses these but isn't party
    ])

    if clip_mode == "pre_edited":
        clip_mode_instruction = (
            "IMPORTANT: These clips are already pre-edited by the user. "
            "Use as much of each clip as possible — only trim dead air at the very start/end."
        )
        clip_count_instruction = (
            "Split each source clip into 3-5 scenes of 10-20s each for visual variety."
        )
    else:
        clip_mode_instruction = (
            "These are raw clips. Apply shot quality filtering.\n"
            "REJECT only if the shot is technically unusable:\n"
            "- severely blurry or shaky (subject unrecognizable)\n"
            "- so dark you cannot see the subject at all\n"
            "- completely blown-out / no detail\n"
            "- subject fully cut off or out of frame\n"
            "- visually empty with no subject (blank wall, floor, sky with nothing)\n"
            "- people setting up / arranging / preparing venue before the event\n"
            "- someone walking away or back fully to camera with nothing else interesting\n"
            "DO NOT reject for: dim/moody lighting, dramatic shadows, slightly warm or cool tones, "
            "or imperfect exposure — these can look beautiful and cinematic.\n"
            "SELECT sections with interesting subjects, genuine moments, or striking visuals — "
            "even if lighting is not perfect, composition and content matter more."
        )
        if is_party:
            clip_count_instruction = (
                "PARTY STYLE RULES: "
                "1) Each clip MUST be 5-10 seconds — NEVER shorter than 5 seconds. "
                "2) One source clip CAN appear multiple times — but NEVER the same time range twice. "
                "3) zoom MUST be non-zero on EVERY clip. zoom=0 is FORBIDDEN. "
                "   Use zoom 6-10 (IN) for ACTION shots and CLOSE-UP moments. "
                "   Use zoom -5 to -8 (OUT) for WIDE crowd shots and establishing shots. "
                "   ALTERNATE zoom direction every clip: in, out, in, out — never 3 same direction in a row. "
                "4) pan MUST never be null. Pan in the direction of movement or toward subjects. "
                "   Rotate through: right, left, top-right, bottom-left, top, bottom. "
                "5) PRIORITIZE GENUINE FUN MOMENTS above all else: people laughing, splashing, dancing, cheering, toasting. "
                "   Motion blur on action shots is ACCEPTABLE — energy matters more than sharpness. "
                "   A blurry laughing shot beats a sharp boring shot EVERY TIME. "
                "6) Aim for 8-12 clips total — mix sources freely to fill the video. "
                "7) Do NOT skip a shot because of motion blur or imperfect framing — if it feels fun and alive, USE IT. "
                "8) Follow CLIENT BRIEF timing and zoom instructions exactly — they override defaults."
            )
        else:
            clip_count_instruction = (
                "Aim for 4-8 clips total. "
                "Follow the CLIENT BRIEF exactly for clip duration — those instructions override this default. "
                "One source CAN appear multiple times — but each segment must be a DIFFERENT shot (no overlapping time ranges). "
                "QUALITY FIRST — reject blurry, dark, shaky, or empty shots. "
                "Pick only sections with best lighting, composition, and visual interest."
            )

    prompt = _DIRECTOR_SYSTEM.format(
        n=len(clip_paths),
        style_prompt=style_prompt,
        durations=", ".join(f"clip{i}={d}s" for i, d in enumerate(durations)),
        silence_info=silence_info,
        transitions=transitions_str,
        clip_mode_instruction=clip_mode_instruction,
        clip_count_instruction=clip_count_instruction,
    )

    # Extract frames once — used by both Gemini and OpenAI
    all_frames: list[list[Image.Image]] = []
    for path in clip_paths:
        frames = await _extract_frames(path, n=5)
        all_frames.append(frames)

    parts: list = [prompt]
    for i, frames in enumerate(all_frames):
        parts.append(f"\n\n--- [Clip {i}] duration={durations[i]}s ---")
        parts.extend(frames)

    loop = asyncio.get_running_loop()

    # Use OpenAI GPT-4o directly
    raw = await _build_plan_openai(prompt, clip_paths, durations, all_frames, loop)
    logger.info("[EDITOR] used OpenAI gpt-4o")
    ai_model = "gpt-4o"
    # Strip markdown fences
    raw = re.sub(r"^```[a-z]*\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)
    # Remove JS-style comments (// and /* */) — Gemini sometimes adds these
    raw = re.sub(r"//[^\n]*", "", raw)
    raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.DOTALL)
    # Fix: Gemini sometimes forgets the closing } of a clip object
    raw = re.sub(r"\}\s*\n(\s*),", r"}\n\1},", raw)
    # Fix: Gemini sometimes forgets the opening { of a clip object
    # Pattern: comma+newline+indent+"source_index" with no { before it
    raw = re.sub(r'(,\s*\n)(\s+)("source_index"\s*:)', r'\1\2{\n\2\3', raw)
    # Remove trailing commas before } or ]
    raw = re.sub(r",\s*([}\]])", r"\1", raw)
    # Extract first complete JSON object
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        raw = m.group(0)

    try:
        plan = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"[EDITOR] JSON parse error: {e}\nRaw: {raw[:800]}")
        raise RuntimeError(f"AI ส่ง JSON ไม่ถูกต้อง: {e}")

    # ── Validate clips ────────────────────────────────────────────────
    validated: list[dict] = []
    source_ranges: dict[int, list[tuple[float, float]]] = {}
    min_seg = 5.0 if is_party else 4.0
    max_seg = 10.0 if is_party else 20.0

    _PANS = ["right", "left", "top", "bottom", "top-right", "bottom-left", "top-left", "bottom-right"]

    def _overlaps(ts: float, te: float, used: list[tuple[float, float]]) -> bool:
        for s, e in used:
            if ts < e and te > s:
                return True
        return False

    for item in plan.get("clips", []):
        idx = max(0, min(len(clip_paths) - 1, int(item.get("source_index", 0))))

        dur = durations[idx]
        ts  = max(0.0, float(item.get("trim_start", 0.0)))
        te  = min(dur, float(item.get("trim_end", dur)))

        if te - ts > max_seg:
            te = min(dur, ts + max_seg)
        if te - ts < min_seg:
            te = min(dur, ts + min_seg)
            if te - ts < min_seg:
                continue

        used = source_ranges.get(idx, [])
        if _overlaps(ts, te, used):
            continue
        source_ranges.setdefault(idx, []).append((ts, te))

        zoom = max(-10, min(10, int(item.get("zoom", 0))))
        pan  = item.get("pan") or _PANS[len(validated) % len(_PANS)]

        transition = item.get("transition", "fade")
        if transition not in ALLOWED_TRANSITIONS:
            transition = "fade"

        speed = max(0.5, min(2.0, float(item.get("speed", 1.0))))
        fade_in  = max(0.0, min(2.0, float(item.get("fade_in",  0.0))))
        fade_out = max(0.0, min(2.0, float(item.get("fade_out", 0.0))))

        raw_cor  = item.get("correction") or {}
        correction = {
            "brightness": max(-3, min(3, int(raw_cor.get("brightness", 0)))),
            "contrast":   max(-3, min(3, int(raw_cor.get("contrast",   0)))),
            "saturation": max(-3, min(3, int(raw_cor.get("saturation", 0)))),
        }

        validated.append({
            "source_index": idx,
            "trim_start":   round(ts, 2),
            "trim_end":     round(te, 2),
            "zoom":         zoom,
            "pan":          pan,
            "transition":   transition,
            "duration_sec": round(te - ts, 2),
            "speed":        round(speed, 2),
            "fade_in":      round(fade_in, 2),
            "fade_out":     round(fade_out, 2),
            "correction":   correction,
        })

    # ── Validate title ────────────────────────────────────────────────
    raw_title = plan.get("title") or {}
    title = None
    if raw_title.get("text"):
        title = {
            "text":     str(raw_title["text"])[:60],
            "position": raw_title.get("position", "bottom"),
            "size":     max(20, min(80, int(raw_title.get("size", 40)))),
        }

    logger.info(f"[EDITOR] plan: {len(validated)} clips from {len(clip_paths)} sources, title={title}, model={ai_model}")
    return {"clips": validated, "durations": durations, "title": title, "ai_model": ai_model}
