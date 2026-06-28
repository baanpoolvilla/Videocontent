"""
video_edit.py — POST /api/v1/video-edit
Supports two upload modes:
  1. Direct: send files in multipart (small clips only, Cloudflare 100MB limit)
  2. Staged: upload each clip via POST /stage first, then send stage_ids to process
     → bypasses Cloudflare limit, each clip is a separate request
"""
import logging
import os
import tempfile
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from minio.error import S3Error

from app.core.config import settings
from app.services.ffmpeg_render import render_with_ffmpeg
from app.services.gemini_editor import build_editorial_plan
from app.services.json2video_render import render_movie
from app.services.storage import storage_service

router = APIRouter(prefix="/video-edit", tags=["video-edit"])
logger = logging.getLogger(__name__)

_BUCKET         = "video-edits"
_STAGING_BUCKET = "video-staging"
_MAX_CLIPS      = 10
_VALID_EXT      = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}


def _ensure_buckets() -> None:
    for bucket in (_BUCKET, _STAGING_BUCKET):
        try:
            if not storage_service.client.bucket_exists(bucket):
                storage_service.client.make_bucket(bucket)
                logger.info(f"[EDIT] created bucket '{bucket}'")
        except S3Error as e:
            logger.warning(f"[EDIT] bucket {bucket}: {e}")


# ── List rendered videos ──────────────────────────────────────────────
@router.get("")
async def list_edits():
    """List all rendered videos, newest first."""
    _ensure_buckets()
    try:
        objects = list(storage_service.client.list_objects(_BUCKET, recursive=True))
        results = []
        for obj in objects:
            url = f"{settings.PUBLIC_API_BASE_URL}/api/v1/files/{_BUCKET}/{obj.object_name}"
            results.append({
                "url":     url,
                "name":    obj.object_name,
                "size_mb": round((obj.size or 0) / 1_048_576, 1),
                "created": obj.last_modified.isoformat() if obj.last_modified else None,
            })
        results.sort(key=lambda x: x["created"] or "", reverse=True)
        return {"videos": results}
    except Exception:
        return {"videos": []}


# ── Delete a rendered video ───────────────────────────────────────────
@router.delete("/{object_name}")
async def delete_edit(object_name: str):
    """Delete a rendered video from the video-edits bucket."""
    try:
        storage_service.client.remove_object(_BUCKET, object_name)
        logger.info(f"[EDIT] deleted {object_name}")
        return {"deleted": object_name}
    except Exception as exc:
        raise HTTPException(500, f"ลบไม่สำเร็จ: {exc}")


# ── Stage a single clip ───────────────────────────────────────────────
@router.post("/stage")
async def stage_clip(file: Annotated[UploadFile, File(description="Single video clip")]):
    """
    Upload ONE clip to staging storage.
    Returns a stage_id to pass to POST /video-edit.
    Use this to bypass Cloudflare's 100MB per-request limit when uploading multiple clips.
    """
    _ensure_buckets()

    data = await file.read()
    if not data:
        raise HTTPException(400, "ไฟล์ว่างเปล่า")

    ext = os.path.splitext(file.filename or "clip.mp4")[1].lower() or ".mp4"
    if ext not in _VALID_EXT:
        raise HTTPException(400, f"รองรับ mp4, mov, avi, mkv เท่านั้น")

    minio_path = await storage_service.upload_bytes(
        data=data,
        filename=f"stage{ext}",
        content_type=file.content_type or "video/mp4",
        bucket=_STAGING_BUCKET,
    )
    logger.info(f"[STAGE] {file.filename} ({len(data)//1024}KB) → {minio_path}")
    return {
        "stage_id": minio_path,      # e.g. "/video-staging/uuid.mp4"
        "filename": file.filename,
        "size_mb":  round(len(data) / 1_048_576, 1),
    }


# ── Main edit endpoint ────────────────────────────────────────────────
@router.post("")
async def auto_edit(
    style_prompt:  Annotated[str, Form()],
    resolution:    Annotated[str, Form()] = "portrait",
    render_engine: Annotated[str, Form()] = "ffmpeg",
    # Direct upload (small files)
    files:         Annotated[list[UploadFile] | None, File()] = None,
    # Staged upload (each file uploaded individually via /stage first)
    stage_ids:     Annotated[list[str] | None, Form()] = None,
):
    """
    Process clips into an edited video.
    Provide either 'files' (direct) or 'stage_ids' (pre-staged, recommended for multiple clips).
    """
    if not style_prompt.strip():
        raise HTTPException(400, "กรุณาระบุ style prompt")
    if resolution not in ("portrait", "landscape", "square"):
        resolution = "portrait"
    if render_engine not in ("ffmpeg", "json2video"):
        render_engine = "ffmpeg"

    has_files  = bool(files)
    has_staged = bool(stage_ids)

    if not has_files and not has_staged:
        raise HTTPException(400, "กรุณาอัปโหลดคลิปอย่างน้อย 1 ไฟล์")

    _ensure_buckets()

    with tempfile.TemporaryDirectory() as tmp:
        clip_paths: list[str] = []

        # ── Load staged clips from MinIO ──────────────────────────────
        if has_staged:
            if len(stage_ids) > _MAX_CLIPS:
                raise HTTPException(400, f"สูงสุด {_MAX_CLIPS} คลิป")
            for i, sid in enumerate(stage_ids):
                ext = os.path.splitext(sid)[1] or ".mp4"
                local = os.path.join(tmp, f"clip_{i:02d}{ext}")
                try:
                    data = storage_service.download_bytes(sid)
                    with open(local, "wb") as fp:
                        fp.write(data)
                    clip_paths.append(local)
                    logger.info(f"[EDIT] staged clip {i} loaded ({len(data)//1024}KB)")
                except Exception as exc:
                    raise HTTPException(400, f"โหลด staged clip {i} ไม่ได้: {exc}")
                # Delete staging file after loading — free up storage immediately
                try:
                    parts = sid.strip("/").split("/", 1)
                    storage_service.client.remove_object(parts[0], parts[1])
                    logger.info(f"[EDIT] staging deleted: {sid}")
                except Exception:
                    pass  # non-fatal

        # ── Load direct-upload clips ──────────────────────────────────
        if has_files:
            offset = len(clip_paths)
            if offset + len(files) > _MAX_CLIPS:
                raise HTTPException(400, f"สูงสุด {_MAX_CLIPS} คลิปรวมกัน")
            for i, f in enumerate(files):
                data = await f.read()
                if not data:
                    raise HTTPException(400, f"ไฟล์ที่ {i+1} ว่างเปล่า")
                ext = os.path.splitext(f.filename or "clip.mp4")[1].lower() or ".mp4"
                if ext not in _VALID_EXT:
                    raise HTTPException(400, f"ไฟล์ที่ {i+1}: รองรับ mp4, mov, avi, mkv เท่านั้น")
                local = os.path.join(tmp, f"clip_{offset+i:02d}{ext}")
                with open(local, "wb") as fp:
                    fp.write(data)
                clip_paths.append(local)
                logger.info(f"[EDIT] direct clip {i} saved ({len(data)//1024}KB)")

        total = len(clip_paths)
        logger.info(f"[EDIT] total clips: {total} | engine={render_engine}")

        # ── Gemini editorial plan ─────────────────────────────────────
        try:
            plan = await build_editorial_plan(clip_paths, style_prompt.strip())
        except Exception as exc:
            logger.error(f"[EDIT] Gemini failed: {exc}", exc_info=True)
            raise HTTPException(500, f"Gemini วิเคราะห์วิดีโอไม่สำเร็จ: {exc}")

        # ── Render ────────────────────────────────────────────────────
        if render_engine == "ffmpeg":
            try:
                final_path = await render_with_ffmpeg(
                    plan, clip_paths, resolution, style_prompt.strip(), tmp
                )
            except Exception as exc:
                logger.error(f"[EDIT] FFmpeg failed: {exc}", exc_info=True)
                raise HTTPException(500, f"FFmpeg render ไม่สำเร็จ: {exc}")

            with open(final_path, "rb") as fp:
                out_bytes = fp.read()
            minio_path = await storage_service.upload_bytes(
                data=out_bytes, filename="edited_output.mp4",
                content_type="video/mp4", bucket=_BUCKET,
            )
            video_url = f"{settings.PUBLIC_API_BASE_URL}/api/v1/files{minio_path}"
            logger.info(f"[EDIT] uploaded → {video_url[:80]}")

        else:
            public_urls: list[str] = []
            for i, path in enumerate(clip_paths):
                with open(path, "rb") as fp:
                    fdata = fp.read()
                ext = os.path.splitext(path)[1]
                mpath = await storage_service.upload_bytes(
                    data=fdata, filename=f"clip_{i:02d}{ext}",
                    content_type="video/mp4", bucket=_BUCKET,
                )
                public_urls.append(f"{settings.PUBLIC_API_BASE_URL}/api/v1/files{mpath}")

            try:
                video_url = await render_movie(plan, public_urls, resolution)
            except TimeoutError as exc:
                raise HTTPException(504, str(exc))
            except Exception as exc:
                logger.error(f"[EDIT] JSON2Video failed: {exc}", exc_info=True)
                raise HTTPException(500, f"JSON2Video render ไม่สำเร็จ: {exc}")

    return {
        "video_url":     video_url,
        "source_count":  total,
        "clips_used":    len(plan["clips"]),
        "plan":          plan["clips"],
        "resolution":    resolution,
        "render_engine": render_engine,
    }
