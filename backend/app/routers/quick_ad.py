"""
quick_ad.py — POST /api/v1/quick-ad/generate

"Quick Ad" mode: one image/product in, one ad video out — no AI video-generation call,
no manual steps. Reuses existing pieces (script writer, TTS + word-timed captions, Ken Burns
render) behind a single dedicated endpoint so it reads as its own product, not a buried option
inside System 1.
"""
import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.product import Product
from app.services.ai import ai_service
from app.services.tts import tts_service
from app.services.video import video_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quick-ad", tags=["quick-ad"])


class QuickAdRequest(BaseModel):
    product_id: str | None = None
    product_name: str = ""
    description: str = ""
    image_urls: list[str] = []
    voice_style: str = "หญิง (ไทย)"
    duration_sec: int = 20


class QuickAdResponse(BaseModel):
    video_url: str
    script: str
    voice_style: str
    provider: str


@router.post("/generate", response_model=QuickAdResponse)
async def generate_quick_ad(
    req: QuickAdRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product_name = req.product_name
    description = req.description
    image_urls = list(req.image_urls)

    if req.product_id:
        result = await db.execute(select(Product).where(Product.id == req.product_id))
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        product_name = product_name or product.name
        description = description or (product.description or "")
        if not image_urls:
            image_urls = [
                f"{settings.API_BASE_URL}/api/v1/files/{u.strip('/')}"
                for u in (product.media_urls or [])
            ]

    if not image_urls:
        raise HTTPException(status_code=400, detail="ต้องมีรูปสินค้าอย่างน้อย 1 รูป")
    if not product_name:
        raise HTTPException(status_code=400, detail="ต้องระบุชื่อสินค้า")

    job_id = str(uuid.uuid4())
    logger.info(f"[QUICK-AD] job={job_id} product={product_name} images={len(image_urls)}")

    analysis_result = await ai_service.analyze_product(product_name, description)
    script_result = await ai_service.generate_script(
        product_name, analysis_result["analysis"], duration_sec=req.duration_sec,
    )
    full_script = script_result["script"]["full_script"]

    voice_result = await tts_service.generate_voiceover(
        text=full_script, job_id=job_id, voice_style=req.voice_style,
    )

    render_result = await video_service.render_video(
        job_id=job_id,
        voiceover_url=voice_result["url"],
        image_urls=image_urls,
        duration_sec=req.duration_sec,
        captions=voice_result.get("captions", []),
    )

    logger.info(f"[QUICK-AD] job={job_id} done → {render_result['url'][:80]}")
    return QuickAdResponse(
        video_url=render_result["url"],
        script=full_script,
        voice_style=req.voice_style,
        provider=voice_result.get("model_id", "edge-tts"),
    )
