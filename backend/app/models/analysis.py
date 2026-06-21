import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Analysis(Base):
    __tablename__ = "analysis"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    model_used: Mapped[str | None] = mapped_column(String(100), default="llama-3.3-70b-versatile")
    raw_response: Mapped[dict | None] = mapped_column(JSONB)
    key_features: Mapped[list | None] = mapped_column(ARRAY(Text))
    selling_points: Mapped[list | None] = mapped_column(ARRAY(Text))
    target_audience: Mapped[str | None] = mapped_column(Text)
    mood: Mapped[str | None] = mapped_column(String(100))
    suggested_hooks: Mapped[list | None] = mapped_column(ARRAY(Text))
    tokens_used: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped["Product"] = relationship("Product", back_populates="analysis")
