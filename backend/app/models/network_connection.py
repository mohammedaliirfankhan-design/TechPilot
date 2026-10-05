from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.network_snapshot import NetworkSnapshot


class NetworkConnection(Base):
    __tablename__ = "network_connections"

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

    protocol: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    local_address: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )

    local_port: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    remote_address: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )

    remote_port: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    status: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    pid: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    process_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    snapshot: Mapped["NetworkSnapshot"] = relationship(
        back_populates="connections",
    )