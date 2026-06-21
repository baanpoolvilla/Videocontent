import asyncio
import base64
import httpx
from app.core.config import settings

KLING_BASE_URL = "https://api.klingai.com"


class KlingService:
    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {settings.KLING_API_KEY}",
            "Content-Type": "application/json",
        }

    async def image_to_video(
        self,
        image_url: str,
        prompt: str,
        duration: str = "5",
        aspect_ratio: str = "9:16",
        model_name: str = "kling-v1",
    ) -> dict:
        payload = {
            "model_name": model_name,
            "prompt": prompt,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
        }

        if image_url.startswith("/"):
            minio_endpoint = settings.MINIO_ENDPOINT
            full_url = f"http://{minio_endpoint}{image_url}"
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(full_url)
                resp.raise_for_status()
                image_b64 = base64.b64encode(resp.content).decode()
            payload["image"] = image_b64
        else:
            payload["image"] = image_url

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{KLING_BASE_URL}/v1/videos/image2video",
                headers=self.headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        task_id = data["data"]["task_id"]
        return {"task_id": task_id, "status": "submitted"}

    async def text_to_video(
        self,
        prompt: str,
        duration: str = "5",
        aspect_ratio: str = "9:16",
        model_name: str = "kling-v1",
    ) -> dict:
        payload = {
            "model_name": model_name,
            "prompt": prompt,
            "duration": duration,
            "aspect_ratio": aspect_ratio,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{KLING_BASE_URL}/v1/videos/text2video",
                headers=self.headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        task_id = data["data"]["task_id"]
        return {"task_id": task_id, "status": "submitted"}

    async def get_task_status(self, task_id: str, task_type: str = "image2video") -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{KLING_BASE_URL}/v1/videos/{task_type}/{task_id}",
                headers=self.headers,
            )
            resp.raise_for_status()
            data = resp.json()

        task_data = data["data"]
        status = task_data.get("task_status", "processing")
        video_url = None

        if status == "succeed":
            works = task_data.get("task_result", {}).get("videos", [])
            if works:
                video_url = works[0].get("url")

        return {"task_id": task_id, "status": status, "video_url": video_url}

    async def wait_for_completion(self, task_id: str, task_type: str = "image2video", max_wait: int = 300) -> dict:
        for _ in range(max_wait // 10):
            result = await self.get_task_status(task_id, task_type)
            if result["status"] in ("succeed", "failed"):
                return result
            await asyncio.sleep(10)
        return {"task_id": task_id, "status": "timeout", "video_url": None}


kling_service = KlingService()
