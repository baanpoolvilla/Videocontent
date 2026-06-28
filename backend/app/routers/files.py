import uuid
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import Response, StreamingResponse
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
async def get_file(bucket: str, path: str, request: Request):
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
    total = len(data)

    range_header = request.headers.get("range")
    if range_header:
        try:
            range_val = range_header.replace("bytes=", "")
            start_str, end_str = range_val.split("-")
            start = int(start_str)
            end = int(end_str) if end_str else total - 1
            end = min(end, total - 1)
        except Exception:
            raise HTTPException(status_code=416, detail="Invalid Range header")

        chunk = data[start : end + 1]
        return Response(
            content=chunk,
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{total}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(chunk)),
                "Cache-Control": "public, max-age=86400",
            },
        )

    return StreamingResponse(
        BytesIO(data),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(total),
            "Cache-Control": "public, max-age=86400",
        },
    )
