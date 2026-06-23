import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.services.kling import kling_service
from app.services.wan import wan_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/image-to-video", tags=["image-to-video"])

# Style → prompt mapping
STYLE_PROMPTS = {
    "playful": "playful animated overlay, vibrant colors, doodle effects, energetic motion, fun pool villa",
    "luxury":  "luxury cinematic, slow elegant motion, golden hour lighting, premium pool villa, 4K",
    "party":   "party vibes, dynamic movement, festive colorful lights, energetic pool party atmosphere",
    "minimal": "minimal clean motion, smooth transitions, modern sleek, quiet luxury pool villa",
}


class ImageToVideoRequest(BaseModel):
    image_urls: list[str]
    style: str = "playful"
    aspect_ratio: str = "9:16"
    count: int = 4


class ImageToVideoResponse(BaseModel):
    clip_urls: list[str]
    provider: str


async def _generate_one_kling(image_url: str, prompt: str, aspect_ratio: str) -> str:
    try:
        task = await kling_service.image_to_video(
            image_url=image_url,
            prompt=prompt,
            duration="5",
            aspect_ratio=aspect_ratio,
        )
        result = await kling_service.wait_for_completion(task["task_id"], max_wait=180)
        return result.get("video_url") or ""
    except Exception as e:
        logger.error(f"Kling generation failed: {e}")
        return ""


async def _generate_one_wan(image_url: str, prompt: str, aspect_ratio: str) -> str:
    try:
        result = await wan_service.image_to_video(
            image_url=image_url,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            duration="5",
        )
        return result.get("video_url") or ""
    except Exception as e:
        logger.error(f"Wan generation failed: {e}")
        return ""


@router.post("/generate", response_model=ImageToVideoResponse)
async def generate_clips(req: ImageToVideoRequest):
    if not req.image_urls:
        raise HTTPException(status_code=400, detail="image_urls is required")

    prompt = STYLE_PROMPTS.get(req.style, STYLE_PROMPTS["playful"])
    count = min(req.count, 4)

    # วนซ้ำรูปถ้ามีน้อยกว่า count
    images = [req.image_urls[i % len(req.image_urls)] for i in range(count)]

    # เลือก provider ตาม API key ที่มี
    use_kling = bool(settings.KLING_API_KEY)
    use_wan = bool(settings.FAL_KEY)

    if not use_kling and not use_wan:
        # ไม่มี key — คืน image_urls เป็น fallback
        logger.warning("No image-to-video API key configured, returning images as fallback")
        return ImageToVideoResponse(clip_urls=images, provider="fallback")

    if use_kling:
        tasks = [_generate_one_kling(img, prompt, req.aspect_ratio) for img in images]
        provider = "kling"
    else:
        tasks = [_generate_one_wan(img, prompt, req.aspect_ratio) for img in images]
        provider = "seedance2"

    clip_urls = await asyncio.gather(*tasks)

    # ถ้า generate ไม่ได้ ใช้ image แทน
    result_urls = [url if url else images[i] for i, url in enumerate(clip_urls)]

    return ImageToVideoResponse(clip_urls=result_urls, provider=provider)


@router.get("/styles")
async def get_styles():
    return [
        {"id": k, "prompt": v}
        for k, v in STYLE_PROMPTS.items()
    ]
