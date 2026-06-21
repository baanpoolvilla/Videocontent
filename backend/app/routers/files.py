from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO

from app.services.storage import storage_service

router = APIRouter(prefix="/files", tags=["files"])


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
