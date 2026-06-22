import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ScheduledPost(Base):
    """Uses manual_posts table — scheduled_at added via migration 001."""
    __tablename__ = "manual_posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content_jobs.id", ondelete="CASCADE"), nullable=False)
    render_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("render_versions.id"), nullable=True)
    platform: Mapped[str] = mapped_column(
        Enum("tiktok", "instagram", "youtube_shorts", "facebook", "twitter", name="platform_type"),
        nullable=False,
    )
    caption: Mapped[str | None] = mapped_column(Text)
    hashtags: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    posted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    external_post_id: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(
        Enum("scheduled", "publishing", "published", "failed", name="post_status"),
        default="scheduled",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
