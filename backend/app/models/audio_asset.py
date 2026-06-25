import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AudioAsset(Base):
    __tablename__ = "audio_assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    voice_style: Mapped[str | None] = mapped_column(String(100))
    characters_used: Mapped[int] = mapped_column(Integer, default=0)
    script_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
