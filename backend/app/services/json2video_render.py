"""
json2video_render.py — Convert Gemini's editorial plan to a JSON2Video movie and render it.
Uses httpx (already in requirements.txt). No new packages required.
"""
import asyncio
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_BASE = "https://api.json2video.com/v2/movies"
_POLL_INTERVAL = 8    # seconds
_TIMEOUT_SEC = 300    # 5 minutes


def _zoom_scale(zoom: int) -> float:
    """Convert Gemini zoom (-10..10) to a CSS-like scale factor."""
    # zoom  0  → 1.00 (no change)
    # zoom  10 → 1.50 (50% larger — strong zoom in)
    # zoom -10 → 0.70 (30% smaller — zoom out / wide)
    if zoom >= 0:
        return round(1.0 + zoom * 0.05, 3)
    else:
        return round(1.0 + zoom * 0.03, 3)


def _pan_offset(pan: str | None, scale: float) -> tuple[float, float]:
    """
    Return (x_pct, y_pct) offsets so the oversized element drifts in the pan direction.
    Values are percentages of the canvas size used to offset the element start position.
    """
    if not pan or scale <= 1.0:
        return (0.0, 0.0)
    # How far the element extends beyond the canvas on each side
    overflow = (scale - 1.0) / 2.0   # e.g. scale=1.2 → overflow=10% each side
    drift = overflow * 0.5            # drift half the overflow for subtle pan

    MAP = {
        "left":         (-drift,  0.0),
        "right":        ( drift,  0.0),
        "top":          ( 0.0,  -drift),
        "bottom":       ( 0.0,   drift),
        "top-left":     (-drift, -drift),
        "top-right":    ( drift, -drift),
        "bottom-left":  (-drift,  drift),
        "bottom-right": ( drift,  drift),
    }
    return MAP.get(pan, (0.0, 0.0))


def build_movie_spec(plan: dict, public_urls: list[str], resolution: str = "portrait") -> dict:
    """
    plan        : output of gemini_editor.build_editorial_plan
    public_urls : public-internet URLs for each source clip (same order as upload)
    resolution  : "portrait" | "landscape" | "square"
    """
    scenes = []
    clips = plan.get("clips", [])

    for i, clip in enumerate(clips):
        src = public_urls[clip["source_index"]]
        scale = _zoom_scale(clip.get("zoom", 0))
        x_off, y_off = _pan_offset(clip.get("pan"), scale)

        element: dict = {
            "type": "video",
            "src": src,
            "trim-start": clip["trim_start"],
            "trim-end": clip["trim_end"],
            "volume": 0,
            "zoom": scale,
        }
        if x_off or y_off:
            element["x"] = round(x_off * 100, 1)   # percentage
            element["y"] = round(y_off * 100, 1)

        scene: dict = {"elements": [element]}
        # Add outgoing transition for every clip except the last
        if i < len(clips) - 1:
            scene["transition"] = {
                "style": clip.get("transition", "fade"),
                "duration": 1,
            }

        scenes.append(scene)

    return {
        "comment": "AI-edited — Content Studio",
        "resolution": resolution,
        "fps": 30,
        "scenes": scenes,
    }


async def render_movie(
    plan: dict,
    public_urls: list[str],
    resolution: str = "portrait",
) -> str:
    """Submit to JSON2Video, poll until done, return final video URL."""
    spec = build_movie_spec(plan, public_urls, resolution)
    headers = {
        "x-api-key": settings.JSON2VIDEO_API_KEY,
        "Content-Type": "application/json",
    }

    logger.info(f"[J2V] Submitting {len(spec['scenes'])} scenes resolution={resolution}")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(_BASE, json=spec, headers=headers)
        if not resp.is_success:
            raise RuntimeError(f"JSON2Video submit failed {resp.status_code}: {resp.text[:500]}")

        data = resp.json()
        # Response shape: {"success": true, "project": "ID", ...}
        movie_id = data.get("project") or data.get("movie") or data.get("id") or ""
        if not movie_id:
            raise RuntimeError(f"JSON2Video did not return a movie ID: {data}")
        logger.info(f"[J2V] movie_id={movie_id}")

        elapsed = 0
        while elapsed < _TIMEOUT_SEC:
            await asyncio.sleep(_POLL_INTERVAL)
            elapsed += _POLL_INTERVAL

            poll = await client.get(f"{_BASE}?project={movie_id}", headers=headers)
            if not poll.is_success:
                logger.warning(f"[J2V] poll error {poll.status_code} — retrying")
                continue

            pdata = poll.json()
            logger.info(f"[J2V] poll raw: {str(pdata)[:300]}")

            # Response shape: {"movie": {"status": "...", "url": "..."}}
            movie_obj = pdata.get("movie") or {}
            if isinstance(movie_obj, str):
                continue

            # Flatten: some versions put status/url at top level
            status = movie_obj.get("status") or pdata.get("status", "")
            url_candidate = movie_obj.get("url") or pdata.get("url", "")
            logger.info(f"[J2V] elapsed={elapsed}s status={status}")

            if status == "done":
                if url_candidate:
                    return url_candidate
                raise RuntimeError("JSON2Video returned done but no URL in response")

            if status in ("error", "failed"):
                raise RuntimeError(f"JSON2Video render failed: {movie_obj}")

    raise TimeoutError(f"JSON2Video did not finish within {_TIMEOUT_SEC}s (movie={movie_id})")
