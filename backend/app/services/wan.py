import asyncio
import httpx
from app.core.config import settings
from app.services.storage import storage_service

FAL_BASE = "https://queue.fal.run"

# fal.ai model IDs for Wan — change WAN_MODEL to switch version
WAN_I2V_MODEL = "fal-ai/wan-i2v"        # image-to-video (Wan 2.1 — fastest, cheapest)
WAN_T2V_MODEL = "fal-ai/wan-t2v"        # text-to-video


class WanService:
    def _headers(self) -> dict:
        return {"Authorization": f"Key {settings.FAL_KEY}", "Content-Type": "application/json"}

    async def image_to_video(
        self,
        image_url: str,
        prompt: str,
        aspect_ratio: str = "9:16",
        duration: str = "5",
    ) -> dict:
        """Submit image-to-video job and poll until done."""
        payload = {
            "prompt": prompt,
            "image_url": image_url,
            "aspect_ratio": aspect_ratio,
            "duration": f"{duration}s",
            "resolution": "720p",
        }
        return await self._run(WAN_I2V_MODEL, payload)

    async def text_to_video(
        self,
        prompt: str,
        aspect_ratio: str = "9:16",
        duration: str = "5",
    ) -> dict:
        payload = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "duration": f"{duration}s",
            "resolution": "720p",
        }
        return await self._run(WAN_T2V_MODEL, payload)

    async def _run(self, model: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            # Submit to queue
            r = await client.post(f"{FAL_BASE}/{model}", headers=self._headers(), json=payload)
            r.raise_for_status()
            data = r.json()
            request_id = data["request_id"]

        # Poll until done (max 5 min)
        for _ in range(60):
            await asyncio.sleep(5)
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{FAL_BASE}/{model}/requests/{request_id}/status",
                    headers=self._headers(),
                )
                r.raise_for_status()
                status = r.json()
            if status.get("status") == "COMPLETED":
                break
            if status.get("status") == "FAILED":
                raise RuntimeError(f"Wan generation failed: {status}")

        # Fetch result
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{FAL_BASE}/{model}/requests/{request_id}",
                headers=self._headers(),
            )
            r.raise_for_status()
            result = r.json()

        video_url = result.get("video", {}).get("url") or ""
        return {"task_id": request_id, "video_url": video_url, "status": "succeed"}


wan_service = WanService()
