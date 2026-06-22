from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class AssetOut(BaseModel):
    id: UUID
    name: str
    asset_type: str
    url: str
    bucket: str | None
    size_bytes: int | None
    mime_type: str | None
    tags: list[str] | None
    created_at: datetime
    model_config = {"from_attributes": True}
