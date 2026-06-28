"""
gemini_editor.py — Gemini-powered video editorial planner.
Extracts sample frames from each clip, sends to Gemini Vision,
returns a structured editorial plan (clip order, trim, zoom, pan, transition,
speed, color correction, fade-in/out, and optional title overlay).
Uses google-generativeai (already in requirements.txt).
"""
import asyncio
import json
import logging
import os
import re
import tempfile

import google.generativeai as genai
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_TRANSITIONS = {
    # xfade styles supported by JSON2Video API
    "fade", "dissolve",
    "wipeleft", "wiperight", "wipeup", "wipedown",
    "slideleft", "slideright", "slideup", "slidedown",
    "circleopen", "circleclose",
    "pixelize",
    # hard_cut = omit transition object entirely (instant cut)
    "hard_cut",
}

_DIRECTOR_SYSTEM = """You are a professional video editor and colorist.
You will receive sample frames from {n} raw video clips and a style brief.
Produce an editorial plan: choose which clips to use, order, trim section,
transition, camera motion, speed, color correction, and fade timing.

CLIENT BRIEF: {style_prompt}
Clip durations (seconds): {durations}

Return ONLY a valid JSON object — no markdown, no code fences, no explanation.
Schema:
{{
  "clips": [
    {{
      "source_index":  <int 0-based>,
      "trim_start":    <float seconds>,
      "trim_end":      <float seconds>,
      "zoom":          <int -10 to 10; 0=none, positive=zoom-in, negative=zoom-out>,
      "pan":           <string or null: "left","right","top","bottom","top-left","top-right","bottom-left","bottom-right">,
      "transition":    <string: one of {transitions}>,
      "speed":         <float 0.5-2.0; 1.0=normal, 0.5=half-speed slow-mo, 2.0=double-speed>,
      "fade_in":       <float 0-2.0 seconds; 0=no fade>,
      "fade_out":      <float 0-2.0 seconds; 0=no fade>,
      "correction": {{
        "brightness":  <int -3 to 3; 0=unchanged>,
        "contrast":    <int -3 to 3; 0=unchanged>,
        "saturation":  <int -3 to 3; 0=unchanged>
      }}
    }}
  ],
  "title": {{
    "text":     <string or null — short 1-5 word title overlay, or null if not needed>,
    "position": <"top" | "bottom">,
    "size":     <int 20-80 font size>
  }}
}}

RULES:
1. Reorder clips to best match the style brief.
2. trim_start and trim_end must be within 0 and the clip duration.
3. Each clip segment must be at least 5 seconds (trim_end - trim_start >= 5).
4. {clip_mode_instruction}
5. {clip_count_instruction}
6. Transition mood guide:
   - energetic/fun → hard_cut, wipeleft, slidedown
   - elegant/calm  → fade, dissolve, circleopen
   - tour/property → slideright, slideleft, fade
6. Speed guide — DEFAULT 1.0 unless style clearly demands otherwise:
   - luxury/cinematic/elegant → 0.8 (subtle slow motion looks beautiful)
   - normal property tour → 1.0
   - energetic/party → 1.2 maximum (1.5+ looks rushed and amateur)
7. Correction guide (range -3 to 3 only):
   - luxury/golden → brightness +1, contrast +2, saturation +2
   - fresh/vibrant  → saturation +3, contrast +1
   - moody/dramatic → contrast +3, saturation -1
   - neutral/pro    → brightness 0, contrast 0, saturation 0
8. Smooth fade rules: add fade_in 0.8 on EVERY clip and fade_out 0.8 on EVERY clip for smooth feel.
9. Transition duration should be 1.5s for elegant styles, 0.8s for energetic styles.
9. Title: add a short Thai or English title only for property tour / promotional styles.
10. Return ONLY the JSON object."""


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


async def _extract_frames(path: str, n: int = 3) -> list[Image.Image]:
    duration = await _get_duration(path)
    frames: list[Image.Image] = []
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(n):
            t   = duration * (i + 0.5) / n
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

    transitions_str = ", ".join(sorted(ALLOWED_TRANSITIONS))

    if clip_mode == "pre_edited":
        clip_mode_instruction = (
            "IMPORTANT: These clips are already pre-edited by the user. "
            "Use as much of each clip as possible — only trim dead air at the very start/end. "
            "Total output duration should be close to total input duration."
        )
        clip_count_instruction = (
            "Split each source clip into 3-5 scenes of 10-20s each for visual variety."
        )
    else:
        clip_mode_instruction = (
            "These are raw clips. Select only the BEST moments. "
            "Pick the most visually interesting sections that match the style brief."
        )
        clip_count_instruction = (
            "Aim for 4-6 clips total (5-15s each). Cut boring/repetitive sections aggressively."
        )

    prompt = _DIRECTOR_SYSTEM.format(
        n=len(clip_paths),
        style_prompt=style_prompt,
        durations=", ".join(f"clip{i}={d}s" for i, d in enumerate(durations)),
        transitions=transitions_str,
        clip_mode_instruction=clip_mode_instruction,
        clip_count_instruction=clip_count_instruction,
    )

    parts: list = [prompt]
    for i, path in enumerate(clip_paths):
        parts.append(f"\n\n--- [Clip {i}] duration={durations[i]}s ---")
        frames = await _extract_frames(path, n=3)
        parts.extend(frames)

    loop = asyncio.get_running_loop()
    cfg  = genai.types.GenerationConfig(temperature=0.3, max_output_tokens=8192)
    response = await loop.run_in_executor(
        None,
        lambda: model.generate_content(parts, generation_config=cfg),
    )

    raw = response.text.strip()
    # Strip markdown fences
    raw = re.sub(r"^```[a-z]*\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)
    # Remove JS-style comments (// and /* */) — Gemini sometimes adds these
    raw = re.sub(r"//[^\n]*", "", raw)
    raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.DOTALL)
    # Remove trailing commas before } or ]
    raw = re.sub(r",\s*([}\]])", r"\1", raw)
    # Extract first complete JSON object
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        raw = m.group(0)

    try:
        plan = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"[EDITOR] Gemini JSON parse error: {e}\nRaw: {raw[:800]}")
        raise RuntimeError(f"Gemini ส่ง JSON ไม่ถูกต้อง: {e}")

    # ── Validate clips ────────────────────────────────────────────────
    validated: list[dict] = []
    for item in plan.get("clips", []):
        idx = max(0, min(len(clip_paths) - 1, int(item.get("source_index", 0))))
        dur = durations[idx]
        ts  = max(0.0, float(item.get("trim_start", 0.0)))
        te  = min(dur, float(item.get("trim_end", dur)))
        if te - ts < 5.0:
            te = min(dur, ts + min(20.0, dur))

        zoom       = max(-10, min(10, int(item.get("zoom", 0))))
        pan        = item.get("pan") or None
        transition = item.get("transition", "fade")
        if transition not in ALLOWED_TRANSITIONS:
            transition = "fade"

        speed = float(item.get("speed", 1.0))
        speed = max(0.5, min(2.0, speed))

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

    logger.info(f"[EDITOR] plan: {len(validated)} clips from {len(clip_paths)} sources, title={title}")
    return {"clips": validated, "durations": durations, "title": title}
