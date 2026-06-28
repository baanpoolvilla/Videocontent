"""
video_edit.py — POST /api/v1/video-edit
Accepts 1-10 raw video clips + a free-text style prompt.
Pipeline: MinIO upload → Gemini editorial plan → JSON2Video render → final URL.
"""
import logging
import os
import tempfile
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from minio.error import S3Error

from app.core.config import settings
from app.services.gemini_editor import build_editorial_plan
from app.services.json2video_render import render_movie
from app.services.storage import storage_service

router = APIRouter(prefix="/video-edit", tags=["video-edit"])
logger = logging.getLogger(__name__)

_BUCKET = "video-edits"
_MAX_CLIPS = 10


def _ensure_bucket() -> None:
    try:
        if not storage_service.client.bucket_exists(_BUCKET):
            storage_service.client.make_bucket(_BUCKET)
            logger.info(f"[EDIT] created MinIO bucket '{_BUCKET}'")
    except S3Error as e:
        logger.warning(f"[EDIT] bucket check/create: {e}")


@router.post("")
async def auto_edit(
    style_prompt: Annotated[str, Form(description="Style brief (Thai or English)")],
    files: Annotated[list[UploadFile], File(description="1–10 raw video clips")],
    resolution: Annotated[str, Form()] = "portrait",
):
    """
    Upload 1-10 video clips + a style prompt.
    Gemini analyses sample frames and produces an editorial plan.
    JSON2Video renders the final video and returns a public URL.
    """
    if not files:
        raise HTTPException(400, "กรุณาอัปโหลดอย่างน้อย 1 คลิป")
    if len(files) > _MAX_CLIPS:
        raise HTTPException(400, f"อัปโหลดได้สูงสุด {_MAX_CLIPS} คลิป")
    if not style_prompt.strip():
        raise HTTPException(400, "กรุณาระบุ style prompt")
    if resolution not in ("portrait", "landscape", "square"):
        resolution = "portrait"

    _ensure_bucket()

    with tempfile.TemporaryDirectory() as tmp:
        clip_paths: list[str] = []
        public_urls: list[str] = []

        for i, f in enumerate(files):
            data = await f.read()
            if not data:
                raise HTTPException(400, f"ไฟล์ที่ {i + 1} ว่างเปล่า")

            ext = os.path.splitext(f.filename or "clip.mp4")[1].lower() or ".mp4"
            if ext not in (".mp4", ".mov", ".avi", ".mkv", ".m4v"):
                raise HTTPException(400, f"ไฟล์ที่ {i + 1}: รองรับ mp4, mov, avi, mkv เท่านั้น")

            # Save locally for Gemini frame extraction
            local = os.path.join(tmp, f"clip_{i:02d}{ext}")
            with open(local, "wb") as fp:
                fp.write(data)
            clip_paths.append(local)

            # Upload to MinIO → build public URL
            minio_path = await storage_service.upload_bytes(
                data=data,
                filename=f"clip_{i:02d}{ext}",
                content_type=f.content_type or "video/mp4",
                bucket=_BUCKET,
            )
            public_url = (
                f"{settings.PUBLIC_API_BASE_URL}/api/v1/files{minio_path}"
            )
            public_urls.append(public_url)
            logger.info(f"[EDIT] clip {i} uploaded → {public_url[:80]}")

        # Gemini: analyse frames and produce editorial plan
        try:
            plan = await build_editorial_plan(clip_paths, style_prompt.strip())
        except Exception as exc:
            logger.error(f"[EDIT] Gemini failed: {exc}", exc_info=True)
            raise HTTPException(500, f"Gemini วิเคราะห์วิดีโอไม่สำเร็จ: {exc}")

        # JSON2Video: render the final movie
        try:
            video_url = await render_movie(plan, public_urls, resolution)
        except TimeoutError as exc:
            raise HTTPException(504, str(exc))
        except Exception as exc:
            logger.error(f"[EDIT] JSON2Video failed: {exc}", exc_info=True)
            raise HTTPException(500, f"Render ไม่สำเร็จ: {exc}")

    return {
        "video_url": video_url,
        "source_count": len(files),
        "clips_used": len(plan["clips"]),
        "plan": plan["clips"],
        "resolution": resolution,
    }
