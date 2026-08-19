from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Telemetry(Base):
    __tablename__ = "telemetry"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    device_id: Mapped[str] = mapped_column(
        String(128),
        ForeignKey("agents.device_id"),
        index=True,
        nullable=False,
    )

    hostname: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    cpu_percent: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    memory_percent: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    disk_percent: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )