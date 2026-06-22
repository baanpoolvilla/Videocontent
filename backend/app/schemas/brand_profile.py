from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class BrandProfileCreate(BaseModel):
    name: str
    description: str | None = None
    tone_of_voice: str | None = None
    target_audience: str | None = None
    cta_style: str | None = None
    forbidden_words: list[str] | None = None
    is_default: bool = False


class BrandProfileUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tone_of_voice: str | None = None
    target_audience: str | None = None
    cta_style: str | None = None
    forbidden_words: list[str] | None = None
    is_default: bool | None = None


class BrandProfileOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    tone_of_voice: str | None
    target_audience: str | None
    cta_style: str | None
    forbidden_words: list[str] | None
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
