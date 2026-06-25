import uuid
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from io import BytesIO

from app.services.storage import storage_service

router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    ext = (file.filename or "audio.mp3").rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    url = await storage_service.upload_bytes(
        data=data,
        filename=filename,
        content_type=file.content_type or "audio/mpeg",
        bucket="assets",
        prefix="uploads",
    )
    return {"url": url}


@router.get("/{bucket}/{path:path}")
async def get_file(bucket: str, path: str):
    try:
        data = storage_service.download_bytes(f"/{bucket}/{path}")
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")

    ext = path.rsplit(".", 1)[-1].lower() if "." in path else "bin"
    content_types = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "webp": "image/webp",
        "gif": "image/gif", "mp4": "video/mp4",
        "mp3": "audio/mpeg", "pdf": "application/pdf",
    }
    content_type = content_types.get(ext, "application/octet-stream")

    return StreamingResponse(BytesIO(data), media_type=content_type, headers={
        "Cache-Control": "public, max-age=86400",
        "Content-Length": str(len(data)),
    })
