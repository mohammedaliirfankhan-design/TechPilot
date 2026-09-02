from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    agent_token_hash: Mapped[str | None] = mapped_column(
    String(255),
    nullable=True,
)

    agent_token_created_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True),
    nullable=True,
)

    device_id: Mapped[str] = mapped_column(
        String(128),
        unique=True,
        index=True,
        nullable=False,
    )

    hostname: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    operating_system: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    os_version: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    agent_version: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )