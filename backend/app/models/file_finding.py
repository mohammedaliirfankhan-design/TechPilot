from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class FileFinding(Base):
    """
    Something about a device's downloads or USB use that an admin should
    look at (a risky download, a program copied to a USB drive, a large copy).

    Created by the rules in app/services/file_findings.py when events arrive.
    Contains names and sizes only, never file contents.
    """

    __tablename__ = "file_findings"

    __table_args__ = (
        # The same event or situation is evaluated again on retries; the
        # fingerprint makes that harmless.
        UniqueConstraint(
            "device_id",
            "fingerprint",
            name="uq_file_findings_device_fingerprint",
        ),
        Index("ix_file_findings_org_seen", "organization_id", "last_seen_at"),
        Index("ix_file_findings_device_seen", "device_id", "last_seen_at"),
        Index("ix_file_findings_pending", "notified_at", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    device_id: Mapped[str] = mapped_column(
        ForeignKey("agents.device_id", ondelete="CASCADE"),
        nullable=False,
    )

    # risky_download | usb_program_copied | usb_bulk_copy
    rule: Mapped[str] = mapped_column(String(40), nullable=False)

    # "warn" for now; "risk" is reserved for future, more serious rules.
    severity: Mapped[str] = mapped_column(
        String(10), nullable=False, default="warn", server_default="warn"
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    detail: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # The file name the finding is about (empty for aggregate findings).
    subject: Mapped[str | None] = mapped_column(String(300), nullable=True)

    fingerprint: Mapped[str] = mapped_column(String(200), nullable=False)

    # How many files an aggregate finding covers (1 for single files).
    occurrences: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )

    # When the underlying activity happened (the newest event it covers).
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    # Email digest bookkeeping.
    notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    notify_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )

    notify_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
