from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


PLATFORM_LABELS = {
    "tiktok": "TikTok",
    "instagram": "Instagram",
    "youtube_shorts": "YouTube Shorts",
    "facebook": "Facebook",
    "twitter": "Twitter / X",
}


class PlatformAccountCreate(BaseModel):
    platform: str
    account_name: str
    account_id: str | None = None


class PlatformAccountOut(BaseModel):
    id: UUID
    platform: str
    account_name: str
    account_id: str | None
    is_active: bool
    token_expires_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class SchedulePostCreate(BaseModel):
    content_job_id: UUID
    platforms: list[str]
    scheduled_at: datetime
    caption: str | None = None
    hashtags: list[str] | None = None


class ScheduledPostOut(BaseModel):
    id: UUID
    content_job_id: UUID
    platform: str
    caption: str | None
    hashtags: list[str] | None
    scheduled_at: datetime | None
    posted_at: datetime | None
    status: str
    created_at: datetime
    model_config = {"from_attributes": True}
