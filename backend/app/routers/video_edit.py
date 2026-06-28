"""
video_edit.py — POST /api/v1/video-edit
Supports two upload modes:
  1. Direct: send files in multipart (small clips only, Cloudflare 100MB limit)
  2. Staged: upload each clip via POST /stage first, then send stage_ids to process
     → bypasses Cloudflare limit, each clip is a separate request

Async job pattern (POST /start → GET /job/{id}) solves Cloudflare 100s timeout.
"""
import json
import logging
import os
import shutil
import tempfile
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
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
_JOB_DIR        = "/tmp/video_jobs"
_CHUNK_DIR      = "/tmp/video_chunks"


# ── Job state helpers ─────────────────────────────────────────────────

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
    try:
        storage_service.client.remove_object(_BUCKET, object_name)
        logger.info(f"[EDIT] deleted {object_name}")
        return {"deleted": object_name}
    except Exception as exc:
        raise HTTPException(500, f"ลบไม่สำเร็จ: {exc}")


# ── Chunked upload ────────────────────────────────────────────────────
@router.post("/chunk")
async def upload_chunk(
    upload_id:    Annotated[str, Form()],
    chunk_index:  Annotated[int, Form()],
    total_chunks: Annotated[int, Form()],
    filename:     Annotated[str, Form()],
    chunk:        Annotated[UploadFile, File()],
):
    chunk_dir = os.path.join(_CHUNK_DIR, upload_id)
    os.makedirs(chunk_dir, exist_ok=True)
    data = await chunk.read()
    chunk_path = os.path.join(chunk_dir, f"{chunk_index:05d}")
    with open(chunk_path, "wb") as fp:
        fp.write(data)
    logger.info(f"[CHUNK] {upload_id} chunk {chunk_index+1}/{total_chunks} ({len(data)//1024}KB)")
    return {"received": chunk_index, "total": total_chunks}


@router.post("/assemble")
async def assemble_chunks(
    upload_id:    Annotated[str, Form()],
    total_chunks: Annotated[int, Form()],
    filename:     Annotated[str, Form()],
):
    _ensure_buckets()
    chunk_dir = os.path.join(_CHUNK_DIR, upload_id)
    ext = os.path.splitext(filename)[1].lower() or ".mp4"

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        for i in range(total_chunks):
            cp = os.path.join(chunk_dir, f"{i:05d}")
            if not os.path.exists(cp):
                raise HTTPException(400, f"chunk {i} หายไป — อัปโหลดใหม่อีกครั้ง")
            with open(cp, "rb") as fp:
                tmp.write(fp.read())

    try:
        with open(tmp_path, "rb") as fp:
            data = fp.read()
        minio_path = await storage_service.upload_bytes(
            data=data, filename=f"stage{ext}",
            content_type="video/mp4", bucket=_STAGING_BUCKET,
        )
        logger.info(f"[ASSEMBLE] {filename} {len(data)//1024}KB → {minio_path}")
        return {"stage_id": minio_path, "filename": filename, "size_mb": round(len(data)/1_048_576, 1)}
    finally:
        os.unlink(tmp_path)
        shutil.rmtree(chunk_dir, ignore_errors=True)


# ── Stage a single clip ───────────────────────────────────────────────
@router.post("/stage")
async def stage_clip(file: Annotated[UploadFile, File(description="Single video clip")]):
    _ensure_buckets()
    data = await file.read()
    if not data:
        raise HTTPException(400, "ไฟล์ว่างเปล่า")
    ext = os.path.splitext(file.filename or "clip.mp4")[1].lower() or ".mp4"
    if ext not in _VALID_EXT:
        raise HTTPException(400, "รองรับ mp4, mov, avi, mkv เท่านั้น")
    minio_path = await storage_service.upload_bytes(
        data=data, filename=f"stage{ext}",
        content_type=file.content_type or "video/mp4", bucket=_STAGING_BUCKET,
    )
    logger.info(f"[STAGE] {file.filename} ({len(data)//1024}KB) → {minio_path}")
    return {"stage_id": minio_path, "filename": file.filename, "size_mb": round(len(data)/1_048_576, 1)}


# ── Async job: start render ───────────────────────────────────────────
@router.post("/start", status_code=202)
async def start_edit(
    background_tasks: BackgroundTasks,
    style_prompt:  Annotated[str, Form()],
    resolution:    Annotated[str, Form()] = "portrait",
    render_engine: Annotated[str, Form()] = "ffmpeg",
    stage_ids:     Annotated[list[str] | None, Form()] = None,
):
    """Start render as background job. Returns job_id immediately (no timeout risk)."""
    if not style_prompt.strip():
        raise HTTPException(400, "กรุณาระบุ style prompt")
    if not stage_ids:
        raise HTTPException(400, "กรุณาอัปโหลดคลิปอย่างน้อย 1 ไฟล์")
    if resolution not in ("portrait", "landscape", "square"):
        resolution = "portrait"
    if render_engine not in ("ffmpeg", "json2video"):
        render_engine = "ffmpeg"

    job_id = str(uuid.uuid4())
    _write_job(job_id, {"status": "pending"})
    logger.info(f"[JOB] {job_id} queued | {len(stage_ids)} clips | engine={render_engine}")

    background_tasks.add_task(
        _render_job, job_id, list(stage_ids),
        style_prompt.strip(), resolution, render_engine,
    )
    return {"job_id": job_id}


# ── Async job: poll status ────────────────────────────────────────────
@router.get("/job/{job_id}")
async def get_job_status(job_id: str):
    """Poll render job status. Returns: pending | processing | done | failed."""
    job = _read_job(job_id)
    if job is None:
        raise HTTPException(404, "ไม่พบ job นี้")
    return job


# ── Background render task ────────────────────────────────────────────
async def _render_job(
    job_id: str,
    stage_ids: list[str],
    style_prompt: str,
    resolution: str,
    render_engine: str,
) -> None:
    _ensure_buckets()
    _write_job(job_id, {"status": "processing"})
    logger.info(f"[JOB] {job_id} processing | {len(stage_ids)} clips")

    try:
        with tempfile.TemporaryDirectory() as tmp:
            clip_paths: list[str] = []

            for i, sid in enumerate(stage_ids):
                ext = os.path.splitext(sid)[1] or ".mp4"
                local = os.path.join(tmp, f"clip_{i:02d}{ext}")
                data = storage_service.download_bytes(sid)
                with open(local, "wb") as fp:
                    fp.write(data)
                clip_paths.append(local)
                logger.info(f"[JOB] {job_id} clip {i} loaded ({len(data)//1024}KB)")
                try:
                    parts = sid.strip("/").split("/", 1)
                    storage_service.client.remove_object(parts[0], parts[1])
                except Exception:
                    pass

            logger.info(f"[JOB] {job_id} total clips: {len(clip_paths)}")

            plan = await build_editorial_plan(clip_paths, style_prompt)

            if render_engine == "ffmpeg":
                final_path = await render_with_ffmpeg(
                    plan, clip_paths, resolution, style_prompt, tmp
                )
                with open(final_path, "rb") as fp:
                    out_bytes = fp.read()
                minio_path = await storage_service.upload_bytes(
                    data=out_bytes, filename="edited_output.mp4",
                    content_type="video/mp4", bucket=_BUCKET,
                )
                video_url = f"{settings.PUBLIC_API_BASE_URL}/api/v1/files{minio_path}"
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
                video_url = await render_movie(plan, public_urls, resolution)

        _write_job(job_id, {
            "status":       "done",
            "video_url":    video_url,
            "clips_used":   len(plan["clips"]),
            "plan":         plan["clips"],
            "resolution":   resolution,
            "render_engine": render_engine,
        })
        logger.info(f"[JOB] {job_id} done → {video_url[:80]}")

    except Exception as exc:
        logger.error(f"[JOB] {job_id} failed: {exc}", exc_info=True)
        _write_job(job_id, {"status": "failed", "error": str(exc)})


# ── Legacy sync endpoint (kept for compatibility) ─────────────────────
@router.post("")
async def auto_edit(
    style_prompt:  Annotated[str, Form()],
    resolution:    Annotated[str, Form()] = "portrait",
    render_engine: Annotated[str, Form()] = "ffmpeg",
    files:         Annotated[list[UploadFile] | None, File()] = None,
    stage_ids:     Annotated[list[str] | None, Form()] = None,
):
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

        if has_staged:
            if len(stage_ids) > _MAX_CLIPS:
                raise HTTPException(400, f"สูงสุด {_MAX_CLIPS} คลิป")
            for i, sid in enumerate(stage_ids):
                ext = os.path.splitext(sid)[1] or ".mp4"
                local = os.path.join(tmp, f"clip_{i:02d}{ext}")
                data = storage_service.download_bytes(sid)
                with open(local, "wb") as fp:
                    fp.write(data)
                clip_paths.append(local)
                try:
                    parts = sid.strip("/").split("/", 1)
                    storage_service.client.remove_object(parts[0], parts[1])
                except Exception:
                    pass

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

        total = len(clip_paths)
        logger.info(f"[EDIT] total clips: {total} | engine={render_engine}")

        try:
            plan = await build_editorial_plan(clip_paths, style_prompt.strip())
        except Exception as exc:
            raise HTTPException(500, f"Gemini วิเคราะห์วิดีโอไม่สำเร็จ: {exc}")

        if render_engine == "ffmpeg":
            try:
                final_path = await render_with_ffmpeg(
                    plan, clip_paths, resolution, style_prompt.strip(), tmp
                )
            except Exception as exc:
                raise HTTPException(500, f"FFmpeg render ไม่สำเร็จ: {exc}")

            with open(final_path, "rb") as fp:
                out_bytes = fp.read()
            minio_path = await storage_service.upload_bytes(
                data=out_bytes, filename="edited_output.mp4",
                content_type="video/mp4", bucket=_BUCKET,
            )
            video_url = f"{settings.PUBLIC_API_BASE_URL}/api/v1/files{minio_path}"
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
                raise HTTPException(500, f"JSON2Video render ไม่สำเร็จ: {exc}")

    return {
        "video_url":     video_url,
        "source_count":  total,
        "clips_used":    len(plan["clips"]),
        "plan":          plan["clips"],
        "resolution":    resolution,
        "render_engine": render_engine,
    }
