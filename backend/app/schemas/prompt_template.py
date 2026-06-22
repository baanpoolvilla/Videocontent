from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class PromptTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    template_text: str
    variables: list[str] | None = None
    is_active: bool = True


class PromptTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    template_text: str | None = None
    variables: list[str] | None = None
    is_active: bool | None = None


class PromptTemplateOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    template_text: str
    variables: list | None
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
