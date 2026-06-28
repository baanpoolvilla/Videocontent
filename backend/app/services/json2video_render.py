"""
json2video_render.py — Convert Gemini's editorial plan to a JSON2Video movie and render it.

JSON2Video API v2 (verified from official docs):
  POST /v2/movies  → {"success":true,"project":"ID","timestamp":"..."}
  GET  /v2/movies?project=ID → {"success":true,"movie":{"status":"done","url":"...",...}}

Video element supported properties used here:
  seek, duration, volume, zoom (-10..10 int), pan (direction string),
  speed (0.5-2.0), fade-in, fade-out, correction {brightness,contrast,saturation}

Scene transition: {type:"xfade", style:"fade"|etc, duration:1}
Resolution presets: instagram-story (9:16), twitter-landscape (16:9), squared (1:1)
"""
import asyncio
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_BASE          = "https://api.json2video.com/v2/movies"
_POLL_INTERVAL = 8
_TIMEOUT_SEC   = 300

_VALID_TRANSITIONS = {
    "fade", "dissolve",
    "wipeleft", "wiperight", "wipeup", "wipedown",
    "slideleft", "slideright", "slideup", "slidedown",
    "circleopen", "circleclose",
    "pixelize",
}

_RESOLUTION_MAP = {
    "portrait":  "instagram-story",
    "landscape": "twitter-landscape",
    "square":    "squared",
}

# Text element style presets for title overlays
_TITLE_STYLES = {
    "top": {
        "position": "top-center",
        "style":    "font-family:sans-serif;font-weight:800;color:#FFFFFF;"
                    "text-shadow:0 2px 8px rgba(0,0,0,.8);letter-spacing:2px;",
    },
    "bottom": {
        "position": "bottom-center",
        "style":    "font-family:sans-serif;font-weight:800;color:#FFFFFF;"
                    "text-shadow:0 2px 8px rgba(0,0,0,.8);letter-spacing:2px;",
    },
}


def build_movie_spec(plan: dict, public_urls: list[str], resolution: str = "portrait") -> dict:
    clips  = plan.get("clips", [])
    title  = plan.get("title")
    res    = _RESOLUTION_MAP.get(resolution, "instagram-story")
    scenes = []

    for i, clip in enumerate(clips):
        src      = public_urls[clip["source_index"]]
        seek_t   = clip["trim_start"]
        dur      = round(clip["trim_end"] - clip["trim_start"], 2)
        zoom     = max(-10, min(10, int(clip.get("zoom", 0))))
        pan      = clip.get("pan") or None
        speed    = float(clip.get("speed", 1.0))
        fade_in  = float(clip.get("fade_in", 0.0))
        fade_out = float(clip.get("fade_out", 0.0))
        cor      = clip.get("correction") or {}

        element: dict = {
            "type":     "video",
            "src":      src,
            "seek":     seek_t,
            "duration": dur,
            "volume":   0,
            "resize":   "cover",   # fill frame, no black bars
        }

        if zoom != 0:
            element["zoom"] = zoom
        if pan:
            element["pan"] = pan
        if abs(speed - 1.0) > 0.05:
            element["speed"] = round(speed, 2)
        # Always apply subtle fade for smooth feel; use Gemini value if larger
        element["fade-in"]  = round(max(0.4, fade_in),  2)
        element["fade-out"] = round(max(0.4, fade_out), 2)

        # Color correction (only send non-zero values)
        if any(cor.get(k, 0) != 0 for k in ("brightness", "contrast", "saturation")):
            element["correction"] = {
                k: cor[k] for k in ("brightness", "contrast", "saturation")
                if cor.get(k, 0) != 0
            }

        elements = [element]

        # Title text overlay on first scene only
        if i == 0 and title and title.get("text"):
            pos_key  = title.get("position", "bottom")
            pos_info = _TITLE_STYLES.get(pos_key, _TITLE_STYLES["bottom"])
            txt_el: dict = {
                "type":     "text",
                "text":     title["text"],
                "position": pos_info["position"],
                "style":    pos_info["style"] + f"font-size:{title.get('size', 40)}px;",
                "start":    0.5,
                "duration": min(3.0, dur - 0.5),
                "fade-in":  0.3,
                "fade-out": 0.3,
            }
            elements.append(txt_el)

        scene: dict = {"elements": elements}

        # xfade transition (skip for last scene and hard cuts)
        if i < len(clips) - 1:
            style = clip.get("transition", "fade")
            if style in _VALID_TRANSITIONS:
                scene["transition"] = {
                    "type":     "xfade",
                    "style":    style,
                    "duration": 1.5,
                }
            # hard_cut → no transition object (instant cut)

        scenes.append(scene)

    return {
        "comment":    "AI-edited — Content Studio",
        "resolution": res,
        "scenes":     scenes,
    }


async def render_movie(
    plan: dict,
    public_urls: list[str],
    resolution: str = "portrait",
) -> str:
    """Submit to JSON2Video, poll until done, return final video URL."""
    spec    = build_movie_spec(plan, public_urls, resolution)
    headers = {
        "x-api-key":    settings.JSON2VIDEO_API_KEY,
        "Content-Type": "application/json",
    }

    logger.info(
        f"[J2V] {len(spec['scenes'])} scenes | resolution={spec['resolution']} | "
        f"title={'yes' if plan.get('title') else 'no'}"
    )

    async with httpx.AsyncClient(timeout=60) as client:
        # ── Submit ────────────────────────────────────────────────────
        resp = await client.post(_BASE, json=spec, headers=headers)
        if not resp.is_success:
            raise RuntimeError(
                f"JSON2Video submit failed {resp.status_code}: {resp.text[:500]}"
            )

        data     = resp.json()
        movie_id = data.get("project") or data.get("movie") or data.get("id") or ""
        if not movie_id:
            raise RuntimeError(f"JSON2Video did not return a project ID: {data}")
        logger.info(f"[J2V] project={movie_id}")

        # ── Poll ──────────────────────────────────────────────────────
        elapsed = 0
        while elapsed < _TIMEOUT_SEC:
            await asyncio.sleep(_POLL_INTERVAL)
            elapsed += _POLL_INTERVAL

            poll = await client.get(f"{_BASE}?project={movie_id}", headers=headers)
            if not poll.is_success:
                logger.warning(f"[J2V] poll {poll.status_code} — retrying")
                continue

            pdata     = poll.json()
            movie_obj = pdata.get("movie") or {}
            if isinstance(movie_obj, str):
                continue

            status = movie_obj.get("status") or pdata.get("status", "")
            url    = movie_obj.get("url")    or pdata.get("url", "")
            logger.info(f"[J2V] elapsed={elapsed}s status={status}")

            if status == "done":
                if url:
                    logger.info(f"[J2V] done → {url}")
                    return url
                raise RuntimeError("JSON2Video status=done but no URL returned")

            if status in ("error", "failed", "timeout"):
                raise RuntimeError(f"JSON2Video render failed: {movie_obj or pdata}")

    raise TimeoutError(
        f"JSON2Video did not finish within {_TIMEOUT_SEC}s (project={movie_id})"
    )
