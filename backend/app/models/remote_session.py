from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RemoteSession(Base):
    __tablename__ = "remote_sessions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True
    )

    device_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="REQUESTED"
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )