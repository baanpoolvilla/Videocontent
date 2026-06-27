import asyncio
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

FAL_QUEUE = "https://queue.fal.run"

# ─── TO ADD A NEW MODEL ──────────────────────────────────────────────────────
# 1. Add alias → fal.ai path here in MODELS
# 2. If model has a minimum duration, add to MODEL_MIN_DURATION
# 3. Add alias to frontend storyboard/page.tsx MODELS array (with price/label/etc.)
# 4. Add alias to ai.py suggest_video_prompt_from_image model_label dict
# ─────────────────────────────────────────────────────────────────────────────

# Model IDs on fal.ai — key = alias used by frontend, value = fal.ai endpoint path
MODELS = {
    "hailuo2pro":    "fal-ai/minimax/hailuo-2.3/pro/image-to-video",          # $0.49/คลิป — min 6s
    "kling3s":       "fal-ai/kling-video/v3/standard/image-to-video",         # $1.89/คลิป
    "kling3s_pro":   "fal-ai/kling-video/v3/pro/image-to-video",              # $2.88/คลิป
    "seedance2":     "fal-ai/bytedance/seedance-v1/i2v/turbo",                # $2.43/คลิป — ByteDance fast
    "seedance2_pro": "fal-ai/bytedance/seedance-v1/i2v/standard",             # $4.25/คลิป — ByteDance pro
    "wan21":         "fal-ai/wan/v2.1/image-to-video",                        # $0.30/คลิป — Wan 2.1
    "kenburs":       "kenburs",                                                 # ฟรี — FFmpeg Ken Burns
}

# Minimum duration (seconds) required by each model (fal.ai rejects lower values)
MODEL_MIN_DURATION: dict[str, int] = {
    "fal-ai/minimax/hailuo-2.3/pro/image-to-video": 6,  # Hailuo requires >= 6s
}

# Max prompt characters per model — 90% of documented limit to stay safe
MODEL_PROMPT_CHARS: dict[str, int] = {
    "fal-ai/kling-video/v3/standard/image-to-video":  2400,  # Kling 2500 chars
    "fal-ai/kling-video/v3/pro/image-to-video":       2400,
    "fal-ai/minimax/hailuo-2.3/pro/image-to-video":   1900,  # Hailuo ~2000 chars
    "fal-ai/bytedance/seedance-v1/i2v/turbo":          1900,  # Seedance ~2000 chars
    "fal-ai/bytedance/seedance-v1/i2v/standard":       1900,
    "fal-ai/wan/v2.1/image-to-video":                  1900,  # Wan — no hard limit, cap at 1900
}

# Max seconds per single clip generation for each model
MODEL_MAX_DUR_PER_CLIP: dict[str, int] = {
    "fal-ai/kling-video/v3/standard/image-to-video": 10,
    "fal-ai/kling-video/v3/pro/image-to-video":      10,
    "fal-ai/minimax/hailuo-2.3/pro/image-to-video":  9,
    "fal-ai/bytedance/seedance-v1/i2v/turbo":         10,
    "fal-ai/bytedance/seedance-v1/i2v/standard":      10,
    "fal-ai/wan/v2.1/image-to-video":                 5,
}

DEFAULT_I2V = MODELS["kling3s"]
DEFAULT_T2V = MODELS["kling3s"]


class WanService:
    def _headers(self) -> dict:
        return {"Authorization": f"Key {settings.FAL_KEY}", "Content-Type": "application/json"}

    async def image_to_video(
        self,
        image_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
        duration: str = "5",
        model: str = DEFAULT_I2V,
    ) -> dict:
        dur_int = int(duration) if str(duration).isdigit() else 5
        # Enforce per-model minimum duration (e.g. Hailuo requires >= 6s)
        min_dur = MODEL_MIN_DURATION.get(model, 5)
        dur_int = max(dur_int, min_dur)
        char_limit = MODEL_PROMPT_CHARS.get(model, 1900)
        payload = {
            "image_url": image_url,
            "prompt": prompt[:char_limit],
            "duration": dur_int,
            "aspect_ratio": aspect_ratio,
        }
        logger.info(f"[FAL] image_to_video model={model} duration={dur_int}s aspect={aspect_ratio} image={image_url[:60]}")
        logger.info(f"[FAL] prompt preview: {prompt[:120]}")
        return await self._run(model, payload)

    async def text_to_video(
        self,
        prompt: str,
        aspect_ratio: str = "9:16",
        duration: str = "5",
    ) -> dict:
        payload = {
            "prompt": prompt,
            "duration": int(duration) if str(duration).isdigit() else 5,
            "aspect_ratio": aspect_ratio,
        }
        return await self._run(DEFAULT_T2V, payload)

    async def _run(self, model: str, payload: dict) -> dict:
        logger.info(f"[FAL] model={model} key_set={bool(settings.FAL_KEY)}")
        if not settings.FAL_KEY:
            raise RuntimeError("FAL_KEY not configured")

        url = f"{FAL_QUEUE}/{model}"
        logger.info(f"[FAL] POST {url}")

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, headers=self._headers(), json=payload)
            if not r.is_success:
                raise RuntimeError(f"fal.ai submit error {r.status_code}: {r.text[:600]}")
            data = r.json()
            logger.info(f"[FAL] submit response: {str(data)[:300]}")

        request_id = data.get("request_id") or data.get("id")
        if not request_id:
            raise RuntimeError(f"fal.ai did not return request_id: {data}")

        status_url   = data.get("status_url") or f"{FAL_QUEUE}/{model}/requests/{request_id}/status"
        # fal.ai response_url is truncated (missing model path) — always construct it
        response_url = f"{FAL_QUEUE}/{model}/requests/{request_id}"
        logger.info(f"[FAL] request_id={request_id}")
        logger.info(f"[FAL] status_url={status_url}")
        logger.info(f"[FAL] response_url={response_url}")

        # Poll until COMPLETED (max 5 min)
        for attempt in range(60):
            await asyncio.sleep(5)
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(status_url, headers=self._headers())
                if not r.is_success:
                    logger.warning(f"[FAL] status check {r.status_code}: {r.text[:200]}")
                    continue
                status_data = r.json()

            st = status_data.get("status", "")
            logger.info(f"[FAL] attempt {attempt+1} status={st}")
            if st == "COMPLETED":
                break
            if st in ("FAILED", "ERROR"):
                raise RuntimeError(f"fal.ai generation failed: {status_data}")

        # Fetch result
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(response_url, headers=self._headers())
            if not r.is_success:
                raise RuntimeError(f"fal.ai result error {r.status_code}: {r.text[:200]}")
            result = r.json()

        video_url = (
            (result.get("video") or {}).get("url")
            or result.get("video_url")
            or ""
        )
        logger.info(f"[FAL] done video_url={video_url[:60] if video_url else 'EMPTY'}")
        return {"task_id": request_id, "video_url": video_url, "status": "succeed"}


wan_service = WanService()
