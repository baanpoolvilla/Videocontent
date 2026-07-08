import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class QuickAdClip(Base):
    __tablename__ = "quick_ad_clips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    product_name: Mapped[str] = mapped_column(String(255))
    script: Mapped[str | None] = mapped_column(Text)
    video_url: Mapped[str] = mapped_column(String(500))
    voice_style: Mapped[str | None] = mapped_column(String(100))
    style: Mapped[str | None] = mapped_column(String(50))
    duration_sec: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
