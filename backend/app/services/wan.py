import asyncio
import httpx
from app.core.config import settings

FAL_QUEUE = "https://queue.fal.run"
WAN_I2V = "wan/v2.6/image-to-video"
WAN_T2V = "wan/v2.6/text-to-video"


class WanService:
    def _headers(self) -> dict:
        return {"Authorization": f"Key {settings.FAL_KEY}", "Content-Type": "application/json"}

    async def image_to_video(self, image_url: str, prompt: str, aspect_ratio: str = "9:16", duration: str = "5") -> dict:
        payload = {
            "image_url": image_url,
            "prompt": prompt,
            "duration": int(duration) if str(duration).isdigit() else 5,
        }
        return await self._run(WAN_I2V, payload)

    async def text_to_video(self, prompt: str, aspect_ratio: str = "9:16", duration: str = "5") -> dict:
        payload = {
            "prompt": prompt,
            "duration": int(duration) if str(duration).isdigit() else 5,
        }
        return await self._run(WAN_T2V, payload)

    async def _run(self, model: str, payload: dict) -> dict:
        if not settings.FAL_KEY:
            raise RuntimeError("FAL_KEY not configured")

        # Submit to fal.ai queue
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{FAL_QUEUE}/{model}",
                headers=self._headers(),
                json=payload,
            )
            if not r.is_success:
                raise RuntimeError(f"fal.ai submit error {r.status_code}: {r.text[:300]}")
            data = r.json()

        request_id = data.get("request_id") or data.get("id")
        if not request_id:
            raise RuntimeError(f"fal.ai did not return request_id: {data}")

        # Poll until COMPLETED (max 5 min)
        for _ in range(60):
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
                raise RuntimeError(f"fal.ai result fetch error {r.status_code}: {r.text[:200]}")
            result = r.json()

        video_url = (result.get("video") or {}).get("url") or result.get("video_url") or ""
        return {"task_id": request_id, "video_url": video_url, "status": "succeed"}


wan_service = WanService()
