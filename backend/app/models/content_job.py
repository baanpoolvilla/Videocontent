import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ContentJob(Base):
    __tablename__ = "content_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    template_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("template_versions.id"))
    brand_profile_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("brand_profiles.id"))
    status: Mapped[str] = mapped_column(
        Enum("pending", "processing", "completed", "failed", "dead_letter", "retrying", name="job_status"),
        default="pending",
    )
    review_status: Mapped[str] = mapped_column(
        Enum("draft", "review_needed", "approved", "rejected", name="review_status"),
        default="draft",
    )
    platform: Mapped[str | None] = mapped_column(
        Enum("tiktok", "instagram", "youtube_shorts", "facebook", "twitter", name="platform_type")
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    n8n_execution_id: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    product: Mapped["Product"] = relationship("Product", back_populates="content_jobs")
    scripts: Mapped[list["Script"]] = relationship("Script", back_populates="content_job")
    render_versions: Mapped[list["RenderVersion"]] = relationship("RenderVersion", back_populates="content_job")
