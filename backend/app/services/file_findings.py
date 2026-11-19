# file-findings-version: 1
"""
Turns download and USB activity into findings an admin should look at.

Runs when an agent delivers events (see receive_file_events). Never raises:
a problem here must not stop events from being stored.

Rules
-----
risky_download      A finished download that is a program or script, that the
                    browser warned about (or the user kept after a warning),
                    or that came from a site on a risky list.
usb_program_copied  A program or script copied onto a USB drive.
usb_bulk_copy       Many files or a lot of data copied to one USB drive within
                    one hour (default: 20 files or 100 MB; change with
                    FINDINGS_USB_BULK_FILES / FINDINGS_USB_BULK_MB).

Each finding is identified by a fingerprint, so evaluating the same events
twice (retries, restarts) never creates duplicates.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("TechAIPILOT.file_findings")

# Programs, scripts, shortcuts and disk images. Keep in step with the list the
# Files & downloads page uses for its "Program or script" note.
RISKY_EXTENSIONS = {
    ".exe", ".msi", ".msix", ".appx", ".com", ".scr", ".dll", ".cpl",
    ".bat", ".cmd", ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf",
    ".hta", ".reg", ".lnk", ".jar", ".iso", ".img",
}

DOWNLOAD_TYPES = {"browser_download", "file_downloaded"}

# What the browser (Chrome / Edge) itself said. Only the serious codes count:
# "uncommon" (5) and "unsure" (4) appear on many harmless files.
BROWSER_WARNINGS = {
    1: "browser warned: dangerous file type",
    2: "browser warned: dangerous site",
    3: "browser warned: dangerous content",
    7: "browser warned: dangerous host",
    8: "browser warned: unwanted software",
}
KEPT_AFTER_WARNING = 6

UNFINISHED_DOWNLOADS = {"cancelled", "interrupted"}


@dataclass
class Candidate:
    rule: str
    title: str
    detail: str | None
    subject: str | None
    fingerprint: str
    occurred_at: datetime
    occurrences: int = 1
    severity: str = "warn"


# ---------------------------------------------------------------- helpers

def _aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _extension(name: str | None) -> str:
    return os.path.splitext(name or "")[1].lower()


def _clip(text: str | None, limit: int) -> str | None:
    if text is None:
        return None

    text = " ".join(str(text).split())
    return text[:limit] if text else None


def format_size(total: int | None) -> str:
    if not total:
        return "0 B"

    if total < 1024:
        return f"{total} B"

    value = float(total)

    for unit in ("KB", "MB", "GB", "TB"):
        value /= 1024

        if value < 1024 or unit == "TB":
            return f"{value:.0f} {unit}" if value >= 100 else f"{value:.1f} {unit}"

    return f"{total} B"


def _number_setting(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, "").strip()

    try:
        value = int(raw) if raw else default
    except ValueError:
        value = default

    return max(minimum, min(maximum, value))


def usb_bulk_limits() -> tuple[int, int]:
    """(files, bytes) at which a copy to USB counts as large."""
    files = _number_setting("FINDINGS_USB_BULK_FILES", 20, 2, 100_000)
    megabytes = _number_setting("FINDINGS_USB_BULK_MB", 100, 1, 1_000_000)
    return files, megabytes * 1024 * 1024


# ------------------------------------------------------------------ rules

def _drive_text(event: dict) -> str:
    parts = [event.get("drive_letter"), event.get("volume_label")]
    return " ".join(p for p in parts if p) or "a USB drive"


def _download_candidate(event: dict, classify: Callable | None) -> Candidate | None:
    if event.get("event_type") not in DOWNLOAD_TYPES:
        return None

    if (event.get("download_state") or "").lower() in UNFINISHED_DOWNLOADS:
        return None

    name = event.get("file_name") or "a file"
    reasons: list[str] = []

    if _extension(name) in RISKY_EXTENSIONS:
        reasons.append("program or script")

    danger = event.get("danger_type")

    if danger in BROWSER_WARNINGS:
        reasons.append(BROWSER_WARNINGS[danger])
    elif danger == KEPT_AFTER_WARNING:
        reasons.append("kept after a browser warning")

    domain = event.get("source_domain")

    if classify is not None and domain:
        try:
            _category, risk, reason = classify(domain)
        except Exception:  # noqa: BLE001 - a lookup problem must not stop the rest
            risk, reason = None, None

        if risk == "risky":
            reasons.append(f"risky site ({reason})" if reason else "risky site")

    if not reasons:
        return None

    return Candidate(
        rule="risky_download",
        title=_clip(f"Download needs a look: {name}", 200) or "Download needs a look",
        detail=_clip(f"From {domain or 'an unknown source'} · " + "; ".join(reasons), 1000),
        subject=_clip(name, 300),
        fingerprint=f"dl|{event['dedupe_key']}",
        occurred_at=_aware(event["occurred_at"]),
    )


def _usb_program_candidate(event: dict) -> Candidate | None:
    if event.get("event_type") != "usb_file_written":
        return None

    name = event.get("file_name") or "a file"

    if _extension(name) not in RISKY_EXTENSIONS:
        return None

    return Candidate(
        rule="usb_program_copied",
        title=_clip(f"Program or script copied to a USB drive: {name}", 200) or "Program or script copied to a USB drive",
        detail=_clip(f"Copied to {_drive_text(event)}", 1000),
        subject=_clip(name, 300),
        fingerprint=f"usbprog|{event['dedupe_key']}",
        occurred_at=_aware(event["occurred_at"]),
    )


def _bulk_candidates(db: Any, device_id: str, events: list[dict]) -> list[Candidate]:
    """Large copies to one USB drive, measured over the hour each new file landed in."""
    from app.models.file_event import FileEvent

    max_files, max_bytes = usb_bulk_limits()
    seen: set[tuple[str, datetime]] = set()
    found: list[Candidate] = []

    for event in events:
        if event.get("event_type") != "usb_file_written":
            continue

        volume = event.get("volume_serial") or event.get("drive_letter")

        if not volume:
            continue

        moment = _aware(event["occurred_at"])
        bucket_start = moment.replace(minute=0, second=0, microsecond=0)

        if (volume, bucket_start) in seen:
            continue

        seen.add((volume, bucket_start))

        same_volume = (
            FileEvent.volume_serial == event["volume_serial"]
            if event.get("volume_serial")
            else FileEvent.drive_letter == event["drive_letter"]
        )

        count, total, newest = (
            db.query(
                func.count(FileEvent.id),
                func.coalesce(func.sum(FileEvent.file_size), 0),
                func.max(FileEvent.occurred_at),
            )
            .filter(
                FileEvent.device_id == device_id,
                FileEvent.event_type == "usb_file_written",
                FileEvent.occurred_at >= bucket_start,
                FileEvent.occurred_at < bucket_start + timedelta(hours=1),
                same_volume,
            )
            .one()
        )

        if count < max_files and int(total or 0) < max_bytes:
            continue

        found.append(
            Candidate(
                rule="usb_bulk_copy",
                title=f"{count} files ({format_size(int(total or 0))}) copied to a USB drive",
                detail=_clip(f"Copied to {_drive_text(event)} within one hour", 1000),
                subject=None,
                fingerprint=f"usbbulk|{volume}|{bucket_start.isoformat()}",
                occurred_at=_aware(newest) if newest else moment,
                occurrences=int(count),
            )
        )

    return found


# ------------------------------------------------------------------ store

def _store(db: Any, organization_id: int, device_id: str, candidate: Candidate) -> bool:
    """Create or refresh one finding. True if it is new."""
    from app.models.file_finding import FileFinding

    def refresh(existing: Any) -> None:
        existing.title = candidate.title
        existing.detail = candidate.detail
        existing.subject = candidate.subject
        existing.occurrences = max(existing.occurrences or 1, candidate.occurrences)

        if _aware(existing.last_seen_at) < candidate.occurred_at:
            existing.last_seen_at = candidate.occurred_at

    existing = (
        db.query(FileFinding)
        .filter(FileFinding.device_id == device_id, FileFinding.fingerprint == candidate.fingerprint)
        .first()
    )

    if existing is not None:
        refresh(existing)
        return False

    try:
        with db.begin_nested():
            db.add(
                FileFinding(
                    organization_id=organization_id,
                    device_id=device_id,
                    rule=candidate.rule,
                    severity=candidate.severity,
                    title=candidate.title,
                    detail=candidate.detail,
                    subject=candidate.subject,
                    fingerprint=candidate.fingerprint,
                    occurrences=candidate.occurrences,
                    last_seen_at=candidate.occurred_at,
                )
            )
        return True

    except IntegrityError:
        # Another request created the same finding a moment ago.
        existing = (
            db.query(FileFinding)
            .filter(FileFinding.device_id == device_id, FileFinding.fingerprint == candidate.fingerprint)
            .first()
        )

        if existing is not None:
            refresh(existing)

        return False


def evaluate_new_events(db: Any, agent: Any, events: list[dict]) -> int:
    """
    Check freshly stored events against the rules. Returns how many findings
    were created or refreshed. Never raises.
    """
    if not events:
        return 0

    try:
        try:
            from app.services.domain_intel import classify
        except Exception:  # noqa: BLE001 - the site check is optional
            classify = None

        candidates: list[Candidate] = []

        for event in events:
            for candidate in (
                _download_candidate(event, classify),
                _usb_program_candidate(event),
            ):
                if candidate is not None:
                    candidates.append(candidate)

        candidates.extend(_bulk_candidates(db, agent.device_id, events))

        for candidate in candidates:
            _store(db, agent.organization_id, agent.device_id, candidate)

        if candidates:
            db.commit()

        return len(candidates)

    except Exception:  # noqa: BLE001 - never let this stop event ingestion
        logger.exception("Could not evaluate file findings")

        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass

        return 0
