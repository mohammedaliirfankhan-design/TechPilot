from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.network_snapshot import NetworkSnapshot


class FirewallPosture(Base):
    __tablename__ = "firewall_posture"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("network_snapshots.id"),
        nullable=False,
        unique=True,
    )

    available: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
    )

    domain_enabled: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    private_enabled: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    public_enabled: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
    )

    error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    snapshot: Mapped["NetworkSnapshot"] = relationship(
        back_populates="firewall_posture",
    )