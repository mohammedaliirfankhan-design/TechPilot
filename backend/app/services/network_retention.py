"""
Network data clean-up.

Each agent sends a full network snapshot every minute (about 1,400 a
day per PC, each with a few hundred connection rows). The page only
needs the latest snapshot plus a few hours of history, so old snapshots
are deleted automatically.

Defaults (change with environment variables on Render, no code change):
  NETWORK_SNAPSHOT_RETENTION_DAYS  = 2   full snapshots and their rows
  NETWORK_DOMAIN_RETENTION_DAYS    = 30  website rows not seen since

Runs in a background thread: once a few minutes after the API starts
(Render's free plan sleeps when idle, so this also covers wake-ups),
then every 24 hours. Deletes in small batches so it never locks the
database for long.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.database import SessionLocal
from app.models.firewall_posture import FirewallPosture
from app.models.network_connection import NetworkConnection
from app.models.network_domain import NetworkDomain
from app.models.network_interface import NetworkInterface
from app.models.network_listener import NetworkListener
from app.models.network_snapshot import NetworkSnapshot

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int, minimum: int) -> int:
    try:
        return max(minimum, int(os.getenv(name, default)))
    except ValueError:
        return default


SNAPSHOT_RETENTION_DAYS = _env_int("NETWORK_SNAPSHOT_RETENTION_DAYS", 2, 1)
DOMAIN_RETENTION_DAYS = _env_int("NETWORK_DOMAIN_RETENTION_DAYS", 30, 1)

FIRST_RUN_DELAY_SECONDS = 3 * 60
RUN_EVERY_SECONDS = 24 * 60 * 60
BATCH_SIZE = 200
PAUSE_BETWEEN_BATCHES_SECONDS = 0.5

_lock = threading.Lock()
_started = False
_status: dict = {
    "last_run_started": None,
    "last_run_finished": None,
    "snapshots_deleted": 0,
    "domains_deleted": 0,
    "error": None,
    "snapshot_retention_days": SNAPSHOT_RETENTION_DAYS,
    "domain_retention_days": DOMAIN_RETENTION_DAYS,
}


def _delete_old_snapshots(cutoff: datetime) -> int:
    """
    Delete snapshots older than `cutoff`, children first (the foreign
    keys have no ON DELETE CASCADE in the database).
    """

    total = 0

    while True:
        db = SessionLocal()

        try:
            ids = list(
                db.execute(
                    select(NetworkSnapshot.id)
                    .where(NetworkSnapshot.collected_at < cutoff)
                    .order_by(NetworkSnapshot.id)
                    .limit(BATCH_SIZE)
                ).scalars()
            )

            if not ids:
                return total

            for child in (
                NetworkConnection,
                NetworkListener,
                NetworkInterface,
                FirewallPosture,
            ):
                db.execute(
                    delete(child).where(child.snapshot_id.in_(ids))
                )

            db.execute(
                delete(NetworkSnapshot).where(NetworkSnapshot.id.in_(ids))
            )

            db.commit()
            total += len(ids)

        except Exception:
            db.rollback()
            raise

        finally:
            db.close()

        time.sleep(PAUSE_BETWEEN_BATCHES_SECONDS)


def _delete_old_domains(cutoff: datetime) -> int:
    db = SessionLocal()

    try:
        result = db.execute(
            delete(NetworkDomain).where(NetworkDomain.last_seen < cutoff)
        )
        db.commit()
        return result.rowcount or 0

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


def run_cleanup() -> dict:
    now = datetime.now(timezone.utc)

    with _lock:
        _status["last_run_started"] = now.isoformat()
        _status["error"] = None

    try:
        snapshots = _delete_old_snapshots(
            now - timedelta(days=SNAPSHOT_RETENTION_DAYS)
        )
        domains = _delete_old_domains(
            now - timedelta(days=DOMAIN_RETENTION_DAYS)
        )

        with _lock:
            _status["snapshots_deleted"] = snapshots
            _status["domains_deleted"] = domains

        logger.info(
            "Network clean-up finished: %s snapshots and %s website rows deleted.",
            snapshots,
            domains,
        )

    except Exception as exc:
        logger.exception("Network clean-up failed")
        with _lock:
            _status["error"] = f"{type(exc).__name__}: {exc}"[:300]

    finally:
        with _lock:
            _status["last_run_finished"] = datetime.now(timezone.utc).isoformat()

    return retention_status()


def _loop() -> None:
    time.sleep(FIRST_RUN_DELAY_SECONDS)

    while True:
        run_cleanup()
        time.sleep(RUN_EVERY_SECONDS)


def start_network_retention() -> None:
    """Start the background clean-up once per process."""

    global _started

    with _lock:
        if _started:
            return
        _started = True

    threading.Thread(
        target=_loop,
        daemon=True,
        name="network-retention",
    ).start()


def retention_status() -> dict:
    with _lock:
        return dict(_status)
