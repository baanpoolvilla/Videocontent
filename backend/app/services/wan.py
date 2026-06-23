import asyncio
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

FAL_QUEUE = "https://queue.fal.run"

# Model IDs on fal.ai (verified from fal.ai sandbox)
MODELS = {
    "seedance2":     "bytedance/seedance-2.0/fast/image-to-video",  # fast, affordable
    "seedance2_pro": "bytedance/seedance-2.0/image-to-video",        # full quality
    "wan":           "bytedance/seedance-2.0/fast/image-to-video",   # alias → same as seedance2
    "wan_t2v":       "bytedance/seedance-2.0/fast/image-to-video",
    "kenburs":       "kenburs",
}

DEFAULT_I2V = MODELS["seedance2"]
DEFAULT_T2V = MODELS["seedance2"]


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
        payload = {
            "image_url": image_url,
            "prompt": prompt,
            "duration": int(duration) if str(duration).isdigit() else 5,
            "aspect_ratio": aspect_ratio,
        }
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

        request_id = data.get("request_id") or data.get("id")
        if not request_id:
            raise RuntimeError(f"fal.ai did not return request_id: {data}")

        logger.info(f"[FAL] request_id={request_id} — polling...")

        # Poll until COMPLETED (max 5 min)
        for attempt in range(60):
            await asyncio.sleep(5)
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{FAL_QUEUE}/{model}/requests/{request_id}/status",
                    headers=self._headers(),
                )
                if not r.is_success:
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
            r = await client.get(
                f"{FAL_QUEUE}/{model}/requests/{request_id}",
                headers=self._headers(),
            )
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
