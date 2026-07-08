from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class QuickAdClipUpdate(BaseModel):
    product_name: str | None = None


class QuickAdClipOut(BaseModel):
    id: UUID
    product_name: str
    script: str | None
    video_url: str
    voice_style: str | None
    style: str | None
    duration_sec: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
