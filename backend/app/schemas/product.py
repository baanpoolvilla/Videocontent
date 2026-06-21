from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None
    price: Decimal | None = None
    brand_profile_id: UUID | None = None
    media_urls: list[str] = []
    metadata: dict = {}


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    price: Decimal | None = None
    brand_profile_id: UUID | None = None
    media_urls: list[str] | None = None
    metadata: dict | None = None


class ProductOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    category: str | None
    price: Decimal | None
    brand_profile_id: UUID | None
    media_urls: list
    created_by: UUID | None

    model_config = {"from_attributes": True}
