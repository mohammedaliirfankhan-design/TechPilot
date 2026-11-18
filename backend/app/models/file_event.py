from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FileEvent(Base):
    """
    One file or USB event reported by an agent (1.5.0+).

    Metadata only: names, paths, sizes, hashes, source domains and
    timestamps. File contents are never collected or stored.
    """

    __tablename__ = "file_events"

    __table_args__ = (
        # The agent retries until the backend accepts a batch, so the
        # same event can arrive more than once. This makes it harmless.
        UniqueConstraint(
            "device_id",
            "dedupe_key",
            name="uq_file_events_device_dedupe",
        ),
        Index(
            "ix_file_events_org_occurred",
            "organization_id",
            "occurred_at",
        ),
        Index(
            "ix_file_events_device_occurred",
            "device_id",
            "occurred_at",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    # Deleting a device or organization removes its file events too,
    # so existing delete flows keep working without changes.
    device_id: Mapped[str] = mapped_column(
        ForeignKey("agents.device_id", ondelete="CASCADE"),
        nullable=False,
    )

    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    dedupe_key: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    # browser_download | file_downloaded | usb_inserted | usb_removed
    # | usb_file_written
    event_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        index=True,
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    file_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    sha256: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        index=True,
    )

    # Query strings are removed by the agent: signed links carry tokens.
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    source_domain: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )

    referrer_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)

    browser: Mapped[str | None] = mapped_column(String(32), nullable=True)
    browser_profile: Mapped[str | None] = mapped_column(String(128), nullable=True)
    download_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    danger_type: Mapped[int | None] = mapped_column(Integer, nullable=True)

    browser_flagged: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )

    # Windows Zone.Identifier value: 3 = Internet, 4 = untrusted.
    zone_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    drive_letter: Mapped[str | None] = mapped_column(String(8), nullable=True)
    volume_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    volume_serial: Mapped[str | None] = mapped_column(String(16), nullable=True)
    fs_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
