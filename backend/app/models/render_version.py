import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RenderVersion(Base):
    __tablename__ = "render_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content_jobs.id", ondelete="CASCADE"), nullable=False)
    version_label: Mapped[str | None] = mapped_column(String(10))
    voice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("voices.id"))
    intro_asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"))
    outro_asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"))
    overlay_asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"))
    kling_task_id: Mapped[str | None] = mapped_column(String(255))
    kling_status: Mapped[str | None] = mapped_column(String(50))
    raw_video_url: Mapped[str | None] = mapped_column(String)
    final_video_url: Mapped[str | None] = mapped_column(String)
    thumbnail_url: Mapped[str | None] = mapped_column(String)
    duration_sec: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    resolution: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(
        Enum("pending", "processing", "completed", "failed", "dead_letter", "retrying", name="job_status"),
        default="pending",
    )
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    ffmpeg_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    content_job: Mapped["ContentJob"] = relationship("ContentJob", back_populates="render_versions")
