from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.firewall_posture import FirewallPosture
    from app.models.network_connection import NetworkConnection
    from app.models.network_interface import NetworkInterface
    from app.models.network_listener import NetworkListener


class NetworkSnapshot(Base):
    __tablename__ = "network_snapshots"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    device_id: Mapped[str] = mapped_column(
        ForeignKey("agents.device_id"),
        nullable=False,
        index=True,
    )

    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )

    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    interfaces: Mapped[list["NetworkInterface"]] = relationship(
        back_populates="snapshot",
        cascade="all, delete-orphan",
    )

    connections: Mapped[list["NetworkConnection"]] = relationship(
        back_populates="snapshot",
        cascade="all, delete-orphan",
    )

    listeners: Mapped[list["NetworkListener"]] = relationship(
        back_populates="snapshot",
        cascade="all, delete-orphan",
    )

    firewall_posture: Mapped["FirewallPosture | None"] = relationship(
        back_populates="snapshot",
        cascade="all, delete-orphan",
        uselist=False,
    )