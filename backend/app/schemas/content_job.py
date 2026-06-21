from uuid import UUID

from pydantic import BaseModel


class ContentJobCreate(BaseModel):
    product_id: UUID
    template_version_id: UUID | None = None
    brand_profile_id: UUID | None = None
    platform: str | None = None


class ContentJobOut(BaseModel):
    id: UUID
    product_id: UUID
    status: str
    review_status: str
    platform: str | None
    error_message: str | None
    retry_count: int
    n8n_execution_id: str | None
    created_by: UUID | None

    model_config = {"from_attributes": True}


class ScriptOut(BaseModel):
    id: UUID
    content_job_id: UUID
    hook: str | None
    body: str | None
    cta: str | None
    full_script: str | None
    version: int
    is_approved: bool

    model_config = {"from_attributes": True}


class RenderVersionOut(BaseModel):
    id: UUID
    content_job_id: UUID
    version_label: str | None
    final_video_url: str | None
    thumbnail_url: str | None
    status: str
    cost_usd: float | None

    model_config = {"from_attributes": True}
