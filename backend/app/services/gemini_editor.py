"""
gemini_editor.py — Gemini-powered video editorial planner.
Extracts sample frames from each clip, sends to Gemini Vision,
returns a structured editorial plan (clip order, trim, zoom, pan, transition).
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
    "fade", "wipeup", "wipedown", "wipeleft", "wiperight",
    "circleopen", "circleclose", "slideup", "slidedown",
    "slideleft", "slideright", "hard_cut",
}

_DIRECTOR_SYSTEM = """You are a professional video editor and director.
You will receive sample frames from {n} raw video clips and a style brief.
Your job is to produce an editorial plan: choose which clips to use, in what order,
what section to trim, and what transition to use between scenes.

CLIENT BRIEF: {style_prompt}

Clip durations (seconds): {durations}

Return ONLY a valid JSON object — no markdown, no code fences, no explanation.
Follow this schema exactly:
{{
  "clips": [
    {{
      "source_index": <int, 0-based index of the source clip>,
      "trim_start":   <float, start time in seconds>,
      "trim_end":     <float, end time in seconds>,
      "zoom":         <int -10 to 10; 0=no zoom, positive=zoom in, negative=zoom out>,
      "pan":          <string or null: "left","right","top","bottom","top-left","top-right","bottom-left","bottom-right">,
      "transition":   <string: one of {transitions}>
    }}
  ]
}}

RULES:
1. Reorder clips to best match the style brief.
2. trim_start and trim_end must be within 0 and the clip's duration.
3. Each clip segment must be at least 2 seconds (trim_end - trim_start >= 2).
4. Use each source clip at least once; you may repeat a clip with different trim.
5. Transitions should match the mood: energetic brief → wipeleft/slidedown/hard_cut;
   calm/elegant → fade/circleopen; tour → slideright/slideleft.
6. Return ONLY the JSON object."""


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
            t = duration * (i + 0.5) / n
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


async def build_editorial_plan(clip_paths: list[str], style_prompt: str) -> dict:
    """
    clip_paths : local temp paths to uploaded video clips
    style_prompt : free-text brief from the user (Thai or English)
    Returns dict with "clips" list and "durations" list.
    """
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")

    durations = []
    for p in clip_paths:
        d = await _get_duration(p)
        durations.append(round(d, 2))

    transitions_str = ", ".join(sorted(ALLOWED_TRANSITIONS))
    prompt = _DIRECTOR_SYSTEM.format(
        n=len(clip_paths),
        style_prompt=style_prompt,
        durations=", ".join(f"clip{i}={d}s" for i, d in enumerate(durations)),
        transitions=transitions_str,
    )

    parts: list = [prompt]
    for i, path in enumerate(clip_paths):
        parts.append(f"\n\n--- [Clip {i}] duration={durations[i]}s ---")
        frames = await _extract_frames(path, n=3)
        parts.extend(frames)

    loop = asyncio.get_event_loop()
    cfg = genai.types.GenerationConfig(temperature=0.35, max_output_tokens=4096)
    response = await loop.run_in_executor(
        None,
        lambda: model.generate_content(parts, generation_config=cfg),
    )

    raw = response.text.strip()
    # Strip accidental markdown fences
    raw = re.sub(r"^```[a-z]*\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)

    plan = json.loads(raw)

    validated: list[dict] = []
    for item in plan.get("clips", []):
        idx = max(0, min(len(clip_paths) - 1, int(item.get("source_index", 0))))
        dur = durations[idx]
        ts = max(0.0, float(item.get("trim_start", 0.0)))
        te = min(dur, float(item.get("trim_end", dur)))
        if te - ts < 2.0:
            te = min(dur, ts + min(10.0, dur))
        zoom = max(-10, min(10, int(item.get("zoom", 0))))
        pan = item.get("pan") or None
        transition = item.get("transition", "fade")
        if transition not in ALLOWED_TRANSITIONS:
            transition = "fade"
        validated.append({
            "source_index": idx,
            "trim_start": round(ts, 2),
            "trim_end": round(te, 2),
            "zoom": zoom,
            "pan": pan,
            "transition": transition,
            "duration_sec": round(te - ts, 2),
        })

    logger.info(f"[EDITOR] plan: {len(validated)} clips from {len(clip_paths)} sources")
    return {"clips": validated, "durations": durations}
