from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.network_snapshot import NetworkSnapshot


class NetworkInterface(Base):
    __tablename__ = "network_interfaces"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("network_snapshots.id"),
        nullable=False,
        index=True,
    )

    interface_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    mac_address: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    is_up: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    speed_mbps: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    addresses: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
    )

    snapshot: Mapped["NetworkSnapshot"] = relationship(
        back_populates="interfaces",
    )