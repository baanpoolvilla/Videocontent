"""
quick_ad.py — POST /api/v1/quick-ad/start + GET /api/v1/quick-ad/job/{job_id}

"Quick Ad" mode: one image/product in, one ad video out — no AI video-generation call,
no manual steps. Reuses existing pieces (script writer, TTS + word-timed captions, Ken Burns
render) behind a single dedicated endpoint so it reads as its own product, not a buried option
inside System 1.

Async job pattern (POST /start → GET /job/{id}), same as video_edit.py — script generation +
TTS + FFmpeg rendering easily exceeds a synchronous request/reverse-proxy timeout window.
"""
import json
import logging
import os
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import CurrentUser
from app.models.product import Product
from app.models.quick_ad_clip import QuickAdClip
from app.schemas.quick_ad_clip import QuickAdClipOut, QuickAdClipUpdate
from app.services.ai import ai_service
from app.services.storage import storage_service
from app.services.tts import tts_service
from app.services.video import video_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quick-ad", tags=["quick-ad"])

_JOB_DIR = "/tmp/quick_ad_jobs"


def _job_path(job_id: str) -> str:
    return os.path.join(_JOB_DIR, f"{job_id}.json")


def _write_job(job_id: str, data: dict) -> None:
    os.makedirs(_JOB_DIR, exist_ok=True)
    with open(_job_path(job_id), "w") as f:
        json.dump(data, f)


def _read_job(job_id: str) -> dict | None:
    try:
        with open(_job_path(job_id)) as f:
            return json.load(f)
    except Exception:
        return None


class QuickAdRequest(BaseModel):
    product_id: str | None = None
    product_name: str = ""
    description: str = ""
    image_urls: list[str] = []
    voice_style: str = "หญิง (ไทย)"
    duration_sec: int = 20
    style: str = "auto"  # "auto" (AI looks at the photos and picks one), or a manual override:
    # "warm" (bright Ken Burns grade), "editorial" (moody grade), "prime" (bright/warm sunlit grade)
    burn_captions: bool = True
    use_pauses: bool = True  # insert short silence gaps between script beats instead of one unbroken read
    logo_url: str = ""  # optional — appended as a short full-screen card at the very end of the clip


@router.post("/start", status_code=202)
async def start_quick_ad(
    req: QuickAdRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    background_tasks: BackgroundTasks,
):
    """Start Quick Ad generation as a background job. Returns job_id immediately (no timeout risk)."""
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
    _write_job(job_id, {"status": "pending"})
    logger.info(f"[QUICK-AD] job={job_id} queued product={product_name} images={len(image_urls)}")

    background_tasks.add_task(
        _run_quick_ad_job, job_id, product_name, description, image_urls,
        req.voice_style, req.duration_sec, req.style, req.burn_captions, req.use_pauses, req.logo_url,
        current_user.id,
    )
    return {"job_id": job_id}


@router.get("/job/{job_id}")
async def get_quick_ad_job(job_id: str):
    """Poll Quick Ad job status. Returns: pending | processing | done | failed."""
    job = _read_job(job_id)
    if job is None:
        raise HTTPException(404, "ไม่พบ job นี้")
    return job


@router.get("/clips", response_model=list[QuickAdClipOut])
async def list_clips(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
):
    """Saved clip library — every Quick Ad video that finished rendering."""
    result = await db.execute(
        select(QuickAdClip).order_by(QuickAdClip.created_at.desc()).offset(skip).limit(limit)
    )
    return result.scalars().all()


@router.get("/clips/{clip_id}", response_model=QuickAdClipOut)
async def get_clip(
    clip_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(QuickAdClip).where(QuickAdClip.id == clip_id))
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(404, "ไม่พบคลิปนี้")
    return clip


@router.patch("/clips/{clip_id}", response_model=QuickAdClipOut)
async def update_clip(
    clip_id: uuid.UUID,
    body: QuickAdClipUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(QuickAdClip).where(QuickAdClip.id == clip_id))
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(404, "ไม่พบคลิปนี้")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(clip, field, value)
    await db.commit()
    await db.refresh(clip)
    return clip


@router.delete("/clips/{clip_id}", status_code=204)
async def delete_clip(
    clip_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(QuickAdClip).where(QuickAdClip.id == clip_id))
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(404, "ไม่พบคลิปนี้")
    try:
        bucket, object_name = clip.video_url.strip("/").split("/", 1)
        storage_service.client.remove_object(bucket, object_name)
    except Exception as e:
        logger.warning(f"[QUICK-AD] clip={clip_id} storage delete failed (removing DB row anyway): {e}")
    await db.delete(clip)
    await db.commit()


async def _run_quick_ad_job(
    job_id: str,
    product_name: str,
    description: str,
    image_urls: list[str],
    voice_style: str,
    duration_sec: int,
    style: str,
    burn_captions: bool = True,
    use_pauses: bool = True,
    logo_url: str = "",
    created_by: uuid.UUID | None = None,
) -> None:
    _write_job(job_id, {"status": "processing"})
    try:
        style_reasoning = ""
        if style == "auto":
            style_choice = await ai_service.analyze_visual_style(image_urls, product_name, description)
            style = style_choice["style"]
            style_reasoning = style_choice["reasoning"]
            logger.info(f"[QUICK-AD] job={job_id} auto-picked style={style} ({style_reasoning})")

        analysis_result = await ai_service.analyze_product(product_name, description)
        script_result = await ai_service.generate_script(
            product_name, analysis_result["analysis"], duration_sec=duration_sec,
        )
        full_script = script_result["script"]["full_script"]
        hook = script_result["script"]["hook"]
        beats = script_result["script"].get("beats") or []

        if use_pauses and len(beats) > 1:
            voice_result = await tts_service.generate_voiceover_beats(
                beats=beats, job_id=job_id, voice_style=voice_style,
            )
        else:
            voice_result = await tts_service.generate_voiceover(
                text=full_script, job_id=job_id, voice_style=voice_style,
            )

        render_result = await video_service.render_video(
            job_id=job_id,
            voiceover_url=voice_result["url"],
            image_urls=image_urls,
            duration_sec=duration_sec,
            captions=voice_result.get("captions", []) if burn_captions else None,
            style=style,
            headline=hook,
            subtitle=product_name,
            logo_url=logo_url,
        )

        logger.info(f"[QUICK-AD] job={job_id} done → {render_result['url'][:80]}")
        _write_job(job_id, {
            "status": "done",
            "video_url": render_result["url"],
            "script": full_script,
            "voice_style": voice_style,
            "provider": voice_result.get("model_id", "edge-tts"),
            "style": style,
            "style_reasoning": style_reasoning,
        })

        # Persist to the clip library — background task, so use a fresh session rather
        # than the request-scoped one (which is long gone by the time this runs).
        async with AsyncSessionLocal() as db:
            db.add(QuickAdClip(
                created_by=created_by,
                product_name=product_name,
                script=full_script,
                video_url=render_result["url"],
                voice_style=voice_style,
                style=style,
                duration_sec=duration_sec,
            ))
            await db.commit()
    except Exception as exc:
        logger.error(f"[QUICK-AD] job={job_id} failed: {exc}")
        _write_job(job_id, {"status": "failed", "error": str(exc)})
