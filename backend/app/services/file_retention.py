# file-retention-version: 1
"""
Daily cleanup of old file events (downloads and USB activity).

Works like the network data cleanup: a background thread starts with the API,
waits a couple of minutes, then removes old rows once a day. Nothing to
schedule and nothing to run by hand.

How long events are kept:
  - default 90 days (the longest time range the console can show)
  - change it with the FILE_EVENT_RETENTION_DAYS setting (7 to 3650)
  - FILE_EVENT_RETENTION_DAYS=0 turns the cleanup off

Events are judged by when they happened (occurred_at), the same date the
console uses for its time ranges, so nothing the console could still show is
ever removed.
"""

import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

logger = logging.getLogger("TechAIPILOT.file_retention")

DEFAULT_RETENTION_DAYS = 90
MIN_RETENTION_DAYS = 7
MAX_RETENTION_DAYS = 3650

RUN_EVERY_SECONDS = 24 * 60 * 60
FIRST_RUN_DELAY_SECONDS = 120

# Delete in small batches so a big cleanup never locks the table for long.
BATCH_SIZE = 5000
MAX_DELETE_PER_RUN = 500_000


_lock = threading.Lock()
_stop = threading.Event()
_thread: threading.Thread | None = None

_state: dict[str, Any] = {
    "running": False,
    "last_run_at": None,
    "last_deleted": 0,
    "total_deleted": 0,
    "last_error": None,
    "next_run_at": None,
}


def retention_days() -> int:
    """
    Days to keep events. 0 means the cleanup is switched off.

    Read on every run, so changing the setting needs a restart of the API
    but no code change. A value that is not a whole number falls back to
    the default.
    """
    raw = os.getenv("FILE_EVENT_RETENTION_DAYS", "").strip()

    if not raw:
        return DEFAULT_RETENTION_DAYS

    try:
        days = int(raw)
    except ValueError:
        return DEFAULT_RETENTION_DAYS

    if days == 0:
        return 0

    if days < 0:
        return DEFAULT_RETENTION_DAYS

    return max(MIN_RETENTION_DAYS, min(MAX_RETENTION_DAYS, days))


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat(timespec="seconds") if moment else None


def _update(**values: Any) -> None:
    with _lock:
        _state.update(values)


def purge_old_file_events(
    session_factory: Callable[[], Any],
    days: int,
    now: datetime | None = None,
) -> int:
    """
    Delete file events older than ``days``. Returns how many were removed.

    Stops after about MAX_DELETE_PER_RUN rows; the next daily run carries on.
    """
    from app.models.file_event import FileEvent

    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    deleted_total = 0

    while deleted_total < MAX_DELETE_PER_RUN:
        with session_factory() as db:
            ids = [
                row[0]
                for row in db.query(FileEvent.id)
                .filter(FileEvent.occurred_at < cutoff)
                .order_by(FileEvent.id)
                .limit(BATCH_SIZE)
                .all()
            ]

            if not ids:
                break

            db.query(FileEvent).filter(FileEvent.id.in_(ids)).delete(
                synchronize_session=False
            )
            db.commit()

        deleted_total += len(ids)

    return deleted_total


def run_once(session_factory: Callable[[], Any]) -> int:
    """One cleanup pass. Never raises: problems are recorded in the status."""
    days = retention_days()

    if days == 0:
        _update(last_run_at=datetime.now(timezone.utc), last_deleted=0, last_error=None)
        return 0

    try:
        deleted = purge_old_file_events(session_factory, days)

    except Exception as exc:  # noqa: BLE001 - a cleanup problem must never stop the API
        message = f"{type(exc).__name__}: {exc}"[:300]
        logger.warning("File event cleanup failed: %s", message)
        _update(last_run_at=datetime.now(timezone.utc), last_error=message)
        return 0

    with _lock:
        _state["last_run_at"] = datetime.now(timezone.utc)
        _state["last_deleted"] = deleted
        _state["total_deleted"] += deleted
        _state["last_error"] = None

    if deleted:
        logger.info("File event cleanup removed %d events older than %d days", deleted, days)

    return deleted


def _loop(session_factory: Callable[[], Any]) -> None:
    delay = float(FIRST_RUN_DELAY_SECONDS)

    while not _stop.is_set():
        _update(next_run_at=datetime.now(timezone.utc) + timedelta(seconds=delay))

        if _stop.wait(delay):
            break

        run_once(session_factory)
        delay = float(RUN_EVERY_SECONDS)

    _update(running=False, next_run_at=None)


def start_file_retention(session_factory: Callable[[], Any] | None = None) -> None:
    """Start the daily cleanup in the background. Safe to call more than once."""
    global _thread

    with _lock:
        if _thread is not None and _thread.is_alive():
            return

    if session_factory is None:
        try:
            from app.database import SessionLocal
        except Exception as exc:  # noqa: BLE001 - never stop the API from starting
            logger.warning("File event cleanup not started: %s", exc)
            return

        session_factory = SessionLocal

    _stop.clear()
    _update(running=True)

    _thread = threading.Thread(
        target=_loop,
        args=(session_factory,),
        name="file-retention",
        daemon=True,
    )
    _thread.start()


def stop_file_retention() -> None:
    """Stop the background cleanup (used by tests)."""
    _stop.set()

    if _thread is not None:
        _thread.join(timeout=2)


def file_retention_status() -> dict[str, Any]:
    """What the console can show about the cleanup."""
    days = retention_days()

    with _lock:
        snapshot = dict(_state)

    return {
        "enabled": days > 0,
        "retention_days": days,
        "running": snapshot["running"],
        "last_run_at": _iso(snapshot["last_run_at"]),
        "last_deleted": snapshot["last_deleted"],
        "total_deleted": snapshot["total_deleted"],
        "last_error": snapshot["last_error"],
        "next_run_at": _iso(snapshot["next_run_at"]),
    }
