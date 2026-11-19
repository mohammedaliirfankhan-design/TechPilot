"""
File and download activity reported by the agent (agent 1.5.0+).

Metadata only: file name, path, size, SHA-256, source domain and
timestamps. File contents are never collected or stored.
"""

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.agent import Agent
from app.models.file_event import FileEvent
from app.models.user import User
from app.security.agent_auth import get_current_agent
from app.services.domain_intel import CATEGORY_LABELS, classify
from app.services.organization import get_user_default_organization
from app.services.file_retention import file_retention_status, start_file_retention


router = APIRouter(
    prefix="/api/v1/security/files",
    tags=["File Activity"],
)


# Remove file events older than the retention period once a day, in the
# background (default 90 days; see file_retention.py).
start_file_retention()


EVENT_TYPES = {
    "browser_download",
    "file_downloaded",
    "usb_inserted",
    "usb_removed",
    "usb_file_written",
}

USB_EVENT_TYPES = {"usb_inserted", "usb_removed", "usb_file_written"}

# The agent sends at most 200 per request. Anything far above that is
# not something a healthy agent produces.
MAX_EVENTS_PER_REQUEST = 500

# Programs, scripts, shortcuts and disk images: the file types most often
# used to deliver malware. Evaluated when events are read, not stored, so
# the list can change without touching old rows.
_RISKY_EXTENSIONS = {
    ".exe", ".msi", ".msix", ".appx", ".com", ".scr", ".dll", ".cpl",
    ".bat", ".cmd", ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf",
    ".hta", ".reg", ".lnk", ".jar", ".iso", ".img",
}

_SHA256_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")


# =========================================================
# HELPERS
# =========================================================

def _require_agent_organization(current_agent: Agent) -> int:
    if current_agent.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent is not assigned to an organization.",
        )

    return current_agent.organization_id


def _require_user_organization(
    db: Session,
    current_user: User,
):
    organization = get_user_default_organization(
        db,
        current_user,
    )

    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account must belong to exactly one active "
                "organization to access file activity data."
            ),
        )

    return organization


def _text(value: Any, max_length: int) -> str | None:
    if value is None:
        return None

    if not isinstance(value, str):
        value = str(value)

    value = value.strip()

    if not value:
        return None

    return value[:max_length]


def _whole_number(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None

    number = int(value)

    if number < 0 or number > 2**62:
        return None

    return number


def _parse_time(value: Any, now: datetime) -> datetime:
    if not isinstance(value, str):
        return now

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return now

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    parsed = parsed.astimezone(timezone.utc)

    # A device clock that is badly wrong must not put events in the future.
    if parsed > now + timedelta(days=1):
        return now

    return parsed


def _event_values(
    raw: Any,
    device_id: str,
    organization_id: int,
    now: datetime,
) -> dict | None:
    """
    Turn one reported event into column values, or None if it is unusable.

    Bad events are skipped one by one rather than failing the whole batch:
    the agent drops a batch the backend rejects as invalid, so a single
    odd event must never cost the rest of its batch.
    """

    if not isinstance(raw, dict):
        return None

    event_type = raw.get("event_type")
    dedupe_key = raw.get("dedupe_key")

    if not isinstance(event_type, str) or event_type not in EVENT_TYPES:
        return None

    if not isinstance(dedupe_key, str) or not 8 <= len(dedupe_key) <= 64:
        return None

    sha256 = raw.get("sha256")

    if not isinstance(sha256, str) or not _SHA256_PATTERN.match(sha256):
        sha256 = None
    else:
        sha256 = sha256.lower()

    return {
        "device_id": device_id,
        "organization_id": organization_id,
        "dedupe_key": dedupe_key,
        "event_type": event_type,
        "occurred_at": _parse_time(raw.get("occurred_at"), now),
        "file_name": _text(raw.get("file_name"), 512),
        "file_path": _text(raw.get("file_path"), 1024),
        "file_size": _whole_number(raw.get("file_size")),
        "sha256": sha256,
        "source_url": _text(raw.get("source_url"), 2048),
        "source_domain": (
            _text(raw.get("source_domain"), 255) or ""
        ).lower() or None,
        "referrer_url": _text(raw.get("referrer_url"), 2048),
        "mime_type": _text(raw.get("mime_type"), 255),
        "browser": _text(raw.get("browser"), 32),
        "browser_profile": _text(raw.get("browser_profile"), 128),
        "download_state": _text(raw.get("download_state"), 32),
        "danger_type": _whole_number(raw.get("danger_type")),
        "browser_flagged": raw.get("browser_flagged") is True,
        "zone_id": _whole_number(raw.get("zone_id")),
        "drive_letter": _text(raw.get("drive_letter"), 8),
        "volume_label": _text(raw.get("volume_label"), 128),
        "volume_serial": _text(raw.get("volume_serial"), 16),
        "fs_type": _text(raw.get("fs_type"), 16),
    }


def _serialize(event: FileEvent) -> dict:
    category = None
    risk = None
    reason = None

    if event.source_domain:
        category, risk, reason = classify(event.source_domain)

    extension = os.path.splitext(event.file_name or "")[1].lower()

    return {
        "id": event.id,
        "event_type": event.event_type,
        "occurred_at": event.occurred_at,
        "file_name": event.file_name,
        "file_path": event.file_path,
        "file_size": event.file_size,
        "sha256": event.sha256,
        "source_url": event.source_url,
        "source_domain": event.source_domain,
        "referrer_url": event.referrer_url,
        "mime_type": event.mime_type,
        "browser": event.browser,
        "download_state": event.download_state,
        "browser_flagged": event.browser_flagged,
        "danger_type": event.danger_type,
        "zone_id": event.zone_id,
        "drive_letter": event.drive_letter,
        "volume_label": event.volume_label,
        "volume_serial": event.volume_serial,
        "fs_type": event.fs_type,
        # Worked out on every read, so list updates apply to old events.
        "domain_category": category,
        "domain_category_label": (
            CATEGORY_LABELS.get(category, category) if category else None
        ),
        "domain_risk": risk,
        "domain_reason": reason,
        "risky_file_type": extension in _RISKY_EXTENSIONS,
    }


# =========================================================
# AGENT: RECEIVE FILE EVENTS
# =========================================================

@router.post("/events")
def receive_file_events(
    payload: dict,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    organization_id = _require_agent_organization(current_agent)

    raw_events = payload.get("events")

    if not isinstance(raw_events, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="events must be a list.",
        )

    if len(raw_events) > MAX_EVENTS_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"At most {MAX_EVENTS_PER_REQUEST} events per request.",
        )

    now = datetime.now(timezone.utc)
    device_id = current_agent.device_id

    rejected = 0
    batch: dict[str, dict] = {}

    for raw in raw_events:
        values = _event_values(raw, device_id, organization_id, now)

        if values is None:
            rejected += 1
            continue

        # A repeat inside the same request counts as a duplicate.
        batch.setdefault(values["dedupe_key"], values)

    existing: set[str] = set()

    if batch:
        existing = {
            row[0]
            for row in db.query(FileEvent.dedupe_key)
            .filter(
                FileEvent.device_id == device_id,
                FileEvent.dedupe_key.in_(list(batch)),
            )
            .all()
        }

    fresh = [v for key, v in batch.items() if key not in existing]

    accepted = 0

    if fresh:
        try:
            db.add_all([FileEvent(**values) for values in fresh])
            db.commit()
            accepted = len(fresh)

        except IntegrityError:
            # The same batch was retried at the same moment. Insert one by
            # one and let the database skip whatever is already there.
            db.rollback()

            for values in fresh:
                try:
                    with db.begin_nested():
                        db.add(FileEvent(**values))
                    accepted += 1
                except IntegrityError:
                    pass

            db.commit()

    return {
        "status": "accepted",
        "accepted": accepted,
        "duplicates": len(raw_events) - rejected - accepted,
        "rejected": rejected,
    }


# =========================================================
# CONSOLE: ONE DEVICE
# =========================================================

@router.get("/devices/{device_id}/events")
def get_device_file_events(
    device_id: str,
    hours: int = Query(24 * 7, ge=1, le=24 * 90),
    event_type: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organization = _require_user_organization(db, current_user)

    if event_type is not None and event_type not in EVENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown event_type.",
        )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id,
            Agent.organization_id == organization.id,
        )
        .first()
    )

    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found.",
        )

    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    base_filters = [
        FileEvent.device_id == device_id,
        FileEvent.organization_id == organization.id,
        FileEvent.occurred_at >= since,
    ]

    by_type = {
        row[0]: row[1]
        for row in db.query(FileEvent.event_type, func.count(FileEvent.id))
        .filter(*base_filters)
        .group_by(FileEvent.event_type)
        .all()
    }

    browser_flagged = (
        db.query(func.count(FileEvent.id))
        .filter(*base_filters, FileEvent.browser_flagged.is_(True))
        .scalar()
    ) or 0

    list_query = db.query(FileEvent).filter(*base_filters)

    if event_type is not None:
        list_query = list_query.filter(FileEvent.event_type == event_type)

    total = list_query.count()

    rows = (
        list_query.order_by(
            FileEvent.occurred_at.desc(),
            FileEvent.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "device_id": device_id,
        "hours": hours,
        "summary": {
            "total": sum(by_type.values()),
            "by_type": by_type,
            "browser_flagged": browser_flagged,
        },
        "total": total,
        "limit": limit,
        "offset": offset,
        "events": [_serialize(row) for row in rows],
    }


# =========================================================
# CONSOLE: WHOLE ORGANIZATION
# =========================================================

@router.get("/overview")
def get_file_activity_overview(
    hours: int = Query(24 * 7, ge=1, le=24 * 90),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organization = _require_user_organization(db, current_user)

    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    base_filters = [
        FileEvent.organization_id == organization.id,
        FileEvent.occurred_at >= since,
    ]

    by_type = {
        row[0]: row[1]
        for row in db.query(FileEvent.event_type, func.count(FileEvent.id))
        .filter(*base_filters)
        .group_by(FileEvent.event_type)
        .all()
    }

    browser_flagged = (
        db.query(func.count(FileEvent.id))
        .filter(*base_filters, FileEvent.browser_flagged.is_(True))
        .scalar()
    ) or 0

    devices_with_usb_activity = (
        db.query(func.count(func.distinct(FileEvent.device_id)))
        .filter(*base_filters, FileEvent.event_type.in_(USB_EVENT_TYPES))
        .scalar()
    ) or 0

    top_domains = [
        {"domain": row[0], "events": row[1]}
        for row in db.query(FileEvent.source_domain, func.count(FileEvent.id))
        .filter(*base_filters, FileEvent.source_domain.isnot(None))
        .group_by(FileEvent.source_domain)
        .order_by(func.count(FileEvent.id).desc())
        .limit(10)
        .all()
    ]

    recent = (
        db.query(FileEvent, Agent.hostname, Agent.display_name)
        .join(Agent, Agent.device_id == FileEvent.device_id)
        .filter(*base_filters)
        .order_by(FileEvent.occurred_at.desc(), FileEvent.id.desc())
        .limit(limit)
        .all()
    )

    events = []

    for event, hostname, display_name in recent:
        item = _serialize(event)
        item["device_id"] = event.device_id
        item["hostname"] = hostname
        item["display_name"] = display_name
        events.append(item)

    return {
        "hours": hours,
        "summary": {
            "total": sum(by_type.values()),
            "by_type": by_type,
            "browser_flagged": browser_flagged,
            "devices_with_usb_activity": devices_with_usb_activity,
        },
        "top_domains": top_domains,
        "events": events,
    }


@router.get("/maintenance/status")
def get_file_maintenance_status(
    current_user: User = Depends(get_current_user),
):
    """How long file events are kept and when the last cleanup ran."""
    return {"cleanup": file_retention_status()}
