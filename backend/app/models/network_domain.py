from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NetworkDomain(Base):
    """
    One row per device per website name.

    Updated in place on every network report (last_seen, hits, apps),
    so the table grows with the number of distinct sites a device
    visits, not with the number of reports.
    """

    __tablename__ = "network_domains"

    __table_args__ = (
        UniqueConstraint("device_id", "domain", name="uq_network_domains_device_domain"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )

    device_id: Mapped[str] = mapped_column(
        ForeignKey("agents.device_id"),
        nullable=False,
        index=True,
    )

    domain: Mapped[str] = mapped_column(String(255), nullable=False)

    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Number of reports in which this site appeared.
    hits: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # App names (e.g. msedge.exe) seen connected to this site.
    apps: Mapped[list[Any] | None] = mapped_column(JSON, nullable=True)

    # malware | phishing | adult | gambling | gaming | social | streaming | system | other
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="other")

    # risky | unnecessary | ok
    risk: Mapped[str] = mapped_column(String(12), nullable=False, default="ok", index=True)

    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
