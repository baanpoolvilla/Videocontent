import uuid
from io import BytesIO

from fastapi import UploadFile
from minio import Minio
from minio.error import S3Error

from app.core.config import settings


class StorageService:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )

    async def upload(self, file: UploadFile, bucket: str, prefix: str = "") -> str:
        data = await file.read()
        ext = file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin"
        object_name = f"{prefix}/{uuid.uuid4()}.{ext}" if prefix else f"{uuid.uuid4()}.{ext}"

        self.client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=BytesIO(data),
            length=len(data),
            content_type=file.content_type or "application/octet-stream",
        )
        return f"/{bucket}/{object_name}"

    async def upload_bytes(self, data: bytes, filename: str, content_type: str, bucket: str, prefix: str = "") -> str:
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
        object_name = f"{prefix}/{uuid.uuid4()}.{ext}" if prefix else f"{uuid.uuid4()}.{ext}"
        self.client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        return f"/{bucket}/{object_name}"

    def get_presigned_url(self, bucket: str, object_name: str, expires: int = 3600) -> str:
        from datetime import timedelta
        return self.client.presigned_get_object(bucket, object_name, expires=timedelta(seconds=expires))


storage_service = StorageService()
