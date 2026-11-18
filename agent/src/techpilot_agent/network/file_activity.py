"""
TechAIPILOT Agent - file activity collector (metadata only).

Reports three kinds of events about the *current Windows user*:

  browser_download   A download recorded in Chrome / Edge / Brave history.
  file_downloaded    A file in Downloads (or an internet-marked file on the
                     Desktop) that no browser history row explained, using
                     the Windows Zone.Identifier stream for its origin.
  usb_inserted /     A removable or USB-attached drive appeared / went away.
  usb_removed
  usb_file_written   A file created on a USB drive after it was inserted.

Only metadata is collected: file name, path, size, SHA-256, source domain
and timestamps. File contents are never read except to compute the hash.

Delivery is at-least-once: events are queued (and persisted to disk) until
the backend accepts them, and every event carries a ``dedupe_key`` so the
backend can ignore repeats.

Dependencies: psutil (already an agent dependency) and the standard library.
"""

from __future__ import annotations

import configparser
import contextlib
import hashlib
import json
import logging
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

import psutil


# Child of the "TechAIPILOT" logger that configure_logging() attaches the
# agent.log file handler to, so these messages land in agent.log.
logger = logging.getLogger("TechAIPILOT.file_activity")


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

POLL_INTERVAL_SECONDS = 20          # how often main.py should call poll()
BROWSER_POLL_SECONDS = 60           # history DBs are read at most this often
USB_BUS_QUERY_SECONDS = 60          # PowerShell USB-bus lookup cadence
FIRST_RUN_LOOKBACK_DAYS = 7         # history/files older than this are ignored

DOWNLOAD_HASH_MAX_BYTES = 256 * 1024 * 1024
USB_HASH_MAX_BYTES = 25 * 1024 * 1024
HASH_BUDGET_SECONDS = 8.0           # total hashing time per poll
USB_SCAN_MAX_ENTRIES = 5000         # directory entries visited per drive/poll
USB_SCAN_BUDGET_SECONDS = 6.0

NEW_FILE_GRACE_SECONDS = 90         # let browsers finish / flush history first
MAX_EVENTS_PER_BATCH = 200
MAX_PENDING_EVENTS = 2000
MAX_REMEMBERED_KEYS = 5000
MAX_URL_LENGTH = 2048

_CHROME_EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)
_SKIP_SUFFIXES = (
    ".crdownload", ".part", ".partial", ".tmp", ".download", ".opdownload",
)
_SKIP_NAMES = {"desktop.ini", "thumbs.db"}
_USB_SKIP_DIRS = {"system volume information", "$recycle.bin"}

_DOWNLOAD_STATES = {0: "in_progress", 1: "complete", 2: "cancelled", 3: "interrupted"}
# Chromium danger_type values that mean "the browser itself flagged this".
_BROWSER_FLAGGED_DANGER_TYPES = {1, 2, 3, 4, 5, 6, 7}

_FOLDERID_DOWNLOADS = "374DE290-123F-4565-9164-39C4925E467B"
_FOLDERID_DESKTOP = "B4BFCC3A-DB2C-424C-B029-7FE99A87C641"

_CREATE_NO_WINDOW = 0x08000000


class _HashBudgetExceeded(Exception):
    pass


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat(
        timespec="seconds"
    )


def _chrome_us_to_ts(microseconds: int) -> float:
    return (_CHROME_EPOCH + timedelta(microseconds=microseconds)).timestamp()


def _ts_to_chrome_us(timestamp: float) -> int:
    moment = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return int((moment - _CHROME_EPOCH).total_seconds() * 1_000_000)


def _norm(path: str) -> str:
    return os.path.normcase(os.path.normpath(path))


def _dedupe_key(*parts: object) -> str:
    joined = "|".join(str(part) for part in parts)
    return hashlib.sha1(joined.encode("utf-8", "ignore")).hexdigest()


def clean_url(url: str | None) -> tuple[str | None, str | None]:
    """
    Return (url_without_secrets, domain).

    Query strings, fragments and credentials are dropped: signed download
    links routinely carry tokens that must not be stored.
    """
    if not url:
        return None, None

    url = url.strip()

    if url.lower().startswith("blob:"):
        url = url[5:]

    try:
        parts = urlsplit(url)
    except ValueError:
        return None, None

    host = parts.hostname
    if not parts.scheme or not host:
        return None, None

    netloc = host if parts.port is None else f"{host}:{parts.port}"
    cleaned = f"{parts.scheme}://{netloc}{parts.path}"
    return cleaned[:MAX_URL_LENGTH], host.lower()


def _sha256(
    path: str,
    max_bytes: int,
    deadline: float | None = None,
) -> str | None:
    """
    SHA-256 of a file, or None if it is too large / unreadable.

    Raises _HashBudgetExceeded if ``deadline`` (time.monotonic()) passes.
    """
    try:
        if os.path.getsize(path) > max_bytes:
            return None

        digest = hashlib.sha256()

        with open(path, "rb") as handle:
            while True:
                if deadline is not None and time.monotonic() > deadline:
                    raise _HashBudgetExceeded()

                chunk = handle.read(1024 * 1024)

                if not chunk:
                    break

                digest.update(chunk)

        return digest.hexdigest()

    except OSError:
        return None


# ---------------------------------------------------------------------------
# Windows helpers (all degrade to "nothing" on other platforms / on error)
# ---------------------------------------------------------------------------

def parse_zone_identifier(text: str) -> dict:
    """Parse the contents of a Zone.Identifier stream."""
    parser = configparser.ConfigParser(interpolation=None, strict=False)

    try:
        parser.read_string(text)
    except configparser.Error:
        return {}

    if not parser.has_section("ZoneTransfer"):
        return {}

    section = parser["ZoneTransfer"]

    try:
        zone_id = int(section.get("zoneid")) if section.get("zoneid") else None
    except ValueError:
        zone_id = None

    return {
        "zone_id": zone_id,
        "referrer_url": section.get("referrerurl"),
        "host_url": section.get("hosturl"),
    }


def _read_zone_identifier(path: str) -> dict:
    if sys.platform != "win32":
        return {}

    try:
        with open(
            f"{path}:Zone.Identifier",
            "r",
            encoding="utf-8-sig",
            errors="ignore",
        ) as handle:
            return parse_zone_identifier(handle.read())
    except OSError:
        return {}


def _known_folder(folder_id: str, fallback: Path) -> Path:
    """Resolve a Windows known folder (handles OneDrive / redirected folders)."""
    if sys.platform != "win32":
        return fallback

    try:
        import ctypes
        import uuid
        from ctypes import wintypes

        class _GUID(ctypes.Structure):
            _fields_ = [
                ("Data1", ctypes.c_ulong),
                ("Data2", ctypes.c_ushort),
                ("Data3", ctypes.c_ushort),
                ("Data4", ctypes.c_ubyte * 8),
            ]

        value = uuid.UUID(folder_id)
        guid = _GUID(
            value.time_low,
            value.time_mid,
            value.time_hi_version,
            (ctypes.c_ubyte * 8)(*value.bytes[8:]),
        )

        function = ctypes.windll.shell32.SHGetKnownFolderPath
        function.argtypes = [
            ctypes.POINTER(_GUID),
            wintypes.DWORD,
            wintypes.HANDLE,
            ctypes.POINTER(ctypes.c_wchar_p),
        ]
        function.restype = ctypes.c_long

        buffer = ctypes.c_wchar_p()

        if function(ctypes.byref(guid), 0, None, ctypes.byref(buffer)) != 0:
            return fallback

        try:
            return Path(buffer.value) if buffer.value else fallback
        finally:
            ctypes.windll.ole32.CoTaskMemFree(buffer)

    except Exception:  # noqa: BLE001 - best effort, fall back to default path
        return fallback


def _watched_folders() -> list[tuple[Path, bool]]:
    """(folder, is_downloads_folder) pairs to inspect for new files."""
    home = Path.home()

    return [
        (_known_folder(_FOLDERID_DOWNLOADS, home / "Downloads"), True),
        (_known_folder(_FOLDERID_DESKTOP, home / "Desktop"), False),
    ]


def _volume_info(root: str) -> dict:
    if sys.platform != "win32":
        return {}

    try:
        import ctypes

        name_buffer = ctypes.create_unicode_buffer(261)
        fs_buffer = ctypes.create_unicode_buffer(261)
        serial = ctypes.c_uint32(0)
        max_component = ctypes.c_uint32(0)
        flags = ctypes.c_uint32(0)

        ok = ctypes.windll.kernel32.GetVolumeInformationW(
            ctypes.c_wchar_p(root),
            name_buffer,
            261,
            ctypes.byref(serial),
            ctypes.byref(max_component),
            ctypes.byref(flags),
            fs_buffer,
            261,
        )

        if not ok:
            return {}

        return {
            "label": name_buffer.value or None,
            "serial": f"{serial.value:08X}",
            "fs_type": fs_buffer.value or None,
        }

    except (OSError, AttributeError):
        return {}


# ---------------------------------------------------------------------------
# Chromium (Chrome / Edge / Brave) download history
# ---------------------------------------------------------------------------

def _browser_roots() -> dict[str, Path]:
    base = os.getenv("LOCALAPPDATA")

    if not base:
        return {}

    root = Path(base)

    return {
        "Chrome": root / "Google" / "Chrome" / "User Data",
        "Edge": root / "Microsoft" / "Edge" / "User Data",
        "Brave": root / "BraveSoftware" / "Brave-Browser" / "User Data",
    }


def _profile_dirs(user_data: Path) -> list[Path]:
    try:
        return sorted(
            path
            for path in user_data.iterdir()
            if path.is_dir()
            and (path.name == "Default" or path.name.startswith("Profile "))
        )
    except OSError:
        return []


@contextlib.contextmanager
def _history_connection(history_path: Path):
    """
    Open a browser History database without disturbing the running browser.

    Copies the file to a temp dir first; if the copy is refused (file
    locked), falls back to a read-only immutable open of the original.
    """
    temp_dir = tempfile.mkdtemp(prefix="tp_hist_")
    connection = None

    try:
        try:
            copy_path = Path(temp_dir) / "History"
            shutil.copyfile(history_path, copy_path)
            connection = sqlite3.connect(str(copy_path))
        except OSError:
            connection = sqlite3.connect(
                f"{history_path.as_uri()}?mode=ro&immutable=1",
                uri=True,
            )

        connection.row_factory = sqlite3.Row
        yield connection

    finally:
        if connection is not None:
            connection.close()

        shutil.rmtree(temp_dir, ignore_errors=True)


_DOWNLOAD_COLUMNS = (
    "id", "guid", "target_path", "start_time", "end_time", "total_bytes",
    "received_bytes", "state", "danger_type", "tab_url", "referrer",
    "site_url", "mime_type",
)


def read_chromium_downloads(
    history_path: Path,
    since_microseconds: int,
    limit: int = 300,
) -> list[dict]:
    """
    Rows from a Chromium History ``downloads`` table newer than the cursor.

    Column names are introspected because they differ between versions.
    """
    results: list[dict] = []

    with _history_connection(history_path) as connection:
        available = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(downloads)")
        }

        if not {"start_time", "target_path"} <= available:
            return []

        selected = [c for c in _DOWNLOAD_COLUMNS if c in available]

        query = (
            f"SELECT {', '.join(selected)} FROM downloads "
            "WHERE start_time > ? ORDER BY start_time ASC LIMIT ?"
        )

        for row in connection.execute(query, (since_microseconds, limit)):
            record = dict(row)
            record["final_url"] = None

            if "id" in record:
                try:
                    chain = connection.execute(
                        "SELECT url FROM downloads_url_chains "
                        "WHERE id = ? ORDER BY chain_index DESC LIMIT 1",
                        (record["id"],),
                    ).fetchone()

                    if chain:
                        record["final_url"] = chain[0]
                except sqlite3.Error:
                    pass

            results.append(record)

    return results


# ---------------------------------------------------------------------------
# Collector
# ---------------------------------------------------------------------------

class FileActivityCollector:
    """
    Stateful collector. Typical use from the agent main loop::

        collector = FileActivityCollector(state_dir=DATA_DIR)
        ...
        collector.poll()
        collector.flush(client.send_file_events)
    """

    def __init__(self, state_dir: Path | str):
        self._state_path = Path(state_dir) / "file_activity_state.json"
        self._state = self._load_state()

        self._last_browser_poll = float("-inf")  # "due immediately"
        self._failures = 0
        self._retry_not_before = 0.0

        self._usb: dict[str, dict] = {}
        self._usb_initialised = False
        self._bus_letters: set[str] = set()
        self._bus_checked = float("-inf")

    # ------------------------------------------------------------------ state

    def _load_state(self) -> dict:
        state: dict = {}

        try:
            state = json.loads(self._state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            state = {}

        if not isinstance(state, dict):
            state = {}

        state.setdefault(
            "scan_floor",
            time.time() - FIRST_RUN_LOOKBACK_DAYS * 86400,
        )
        state.setdefault("browser_cursors", {})
        state.setdefault("reported_downloads", {})
        state.setdefault("known_download_paths", {})
        state.setdefault("reported_files", {})
        state.setdefault("pending", [])

        return state

    def _save_state(self) -> None:
        for key in (
            "reported_downloads", "known_download_paths", "reported_files",
        ):
            entries = self._state[key]

            if len(entries) > MAX_REMEMBERED_KEYS:
                self._state[key] = dict(
                    list(entries.items())[-MAX_REMEMBERED_KEYS:]
                )

        try:
            self._state_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = self._state_path.with_suffix(".tmp")
            temp_path.write_text(json.dumps(self._state), encoding="utf-8")
            temp_path.replace(self._state_path)
        except OSError as exc:
            logger.warning("Could not save file activity state: %s", exc)

    # ------------------------------------------------------------------- poll

    def poll(self) -> int:
        """Collect new events into the pending queue. Returns how many."""
        deadline = time.monotonic() + HASH_BUDGET_SECONDS
        new_events: list[dict] = []

        steps = [self._poll_download_folders, self._poll_usb]

        if time.monotonic() - self._last_browser_poll >= BROWSER_POLL_SECONDS:
            self._last_browser_poll = time.monotonic()
            steps.insert(0, self._poll_browsers)

        for step in steps:
            try:
                new_events.extend(step(deadline))
            except Exception:  # noqa: BLE001 - one source must not stop others
                logger.exception("File activity step failed: %s", step.__name__)

        pending = self._state["pending"]
        pending.extend(new_events)

        if len(pending) > MAX_PENDING_EVENTS:
            dropped = len(pending) - MAX_PENDING_EVENTS
            del pending[:dropped]
            logger.warning("File activity queue full; dropped %d oldest", dropped)

        self._save_state()
        return len(new_events)

    # ------------------------------------------------------------------ flush

    def flush(self, sender: Callable[[list[dict]], object]) -> int:
        """
        Send pending events through ``sender`` in batches.

        Keeps events queued if the backend is unreachable (exponential
        backoff, max 5 min). A batch the backend rejects as invalid
        (HTTP 400/422 etc.) is dropped so it cannot block the queue forever.
        """
        pending = self._state["pending"]

        if not pending or time.monotonic() < self._retry_not_before:
            return 0

        sent = 0

        while pending:
            batch = pending[:MAX_EVENTS_PER_BATCH]

            try:
                sender(batch)
            except Exception as exc:  # noqa: BLE001
                status = getattr(getattr(exc, "response", None), "status_code", None)

                if (
                    status is not None
                    and 400 <= status < 500
                    and status not in (401, 403, 404, 408, 429)
                ):
                    logger.error(
                        "Backend rejected %d file events (HTTP %s); dropping",
                        len(batch), status,
                    )
                    del pending[: len(batch)]
                    continue

                self._failures += 1
                delay = min(300, POLL_INTERVAL_SECONDS * 2 ** self._failures)
                self._retry_not_before = time.monotonic() + delay
                logger.warning(
                    "File events not delivered (%s); retry in %ds", exc, delay
                )
                break

            del pending[: len(batch)]
            sent += len(batch)
            self._failures = 0

        self._save_state()
        return sent

    # --------------------------------------------------------------- browsers

    def _poll_browsers(self, deadline: float) -> list[dict]:
        events: list[dict] = []
        now_ts = time.time()
        reported = self._state["reported_downloads"]

        for browser, user_data in _browser_roots().items():
            if not user_data.is_dir():
                continue

            for profile in _profile_dirs(user_data):
                history = profile / "History"

                if not history.is_file():
                    continue

                cursor_key = f"{browser}|{profile.name}"
                cursor = self._state["browser_cursors"].get(cursor_key)

                if cursor is None:
                    cursor = _ts_to_chrome_us(self._state["scan_floor"])

                try:
                    rows = read_chromium_downloads(history, cursor)
                except (sqlite3.Error, OSError) as exc:
                    logger.debug("Cannot read %s history: %s", cursor_key, exc)
                    continue

                new_cursor = cursor
                hold_below: int | None = None

                for row in rows:
                    start = int(row["start_time"])
                    age = now_ts - _chrome_us_to_ts(start)

                    # Still downloading: leave it for a later poll.
                    if row.get("state") == 0 and age < 3600:
                        if hold_below is None:
                            hold_below = start - 1
                        continue

                    event = self._browser_event(
                        row, browser, profile.name, start, deadline
                    )

                    new_cursor = max(new_cursor, start)

                    if event["dedupe_key"] in reported:
                        continue

                    reported[event["dedupe_key"]] = 1
                    self._state["known_download_paths"][
                        _norm(event["file_path"])
                    ] = 1
                    events.append(event)

                if hold_below is not None:
                    new_cursor = min(new_cursor, hold_below)

                self._state["browser_cursors"][cursor_key] = new_cursor

        return events

    def _browser_event(
        self,
        row: dict,
        browser: str,
        profile: str,
        start: int,
        deadline: float,
    ) -> dict:
        target = row.get("target_path") or ""
        state_code = row.get("state")
        danger = row.get("danger_type")

        # Prefer the host that served the file; downloads generated inside a
        # page (blob:/data: URLs) fall back to the page they started from.
        source_url, source_domain = None, None

        for candidate in (
            row.get("final_url"), row.get("tab_url"), row.get("referrer"),
        ):
            source_url, source_domain = clean_url(candidate)

            if source_domain:
                break

        referrer_url, _ = clean_url(row.get("tab_url") or row.get("referrer"))

        sha256 = None

        if state_code == 1 and target and os.path.isfile(target):
            try:
                sha256 = _sha256(target, DOWNLOAD_HASH_MAX_BYTES, deadline)
            except _HashBudgetExceeded:
                sha256 = None

        size = row.get("total_bytes") or row.get("received_bytes") or None

        return {
            "event_type": "browser_download",
            "occurred_at": _iso(_chrome_us_to_ts(start)),
            "dedupe_key": _dedupe_key(
                "bd", browser, profile, row.get("guid") or row.get("id"), start
            ),
            "file_name": os.path.basename(target),
            "file_path": target,
            "file_size": size if size and size > 0 else None,
            "sha256": sha256,
            "source_url": source_url,
            "source_domain": source_domain,
            "referrer_url": referrer_url,
            "mime_type": row.get("mime_type") or None,
            "browser": browser,
            "browser_profile": profile,
            "download_state": _DOWNLOAD_STATES.get(
                state_code, f"state_{state_code}"
            ),
            "danger_type": danger,
            "browser_flagged": danger in _BROWSER_FLAGGED_DANGER_TYPES,
        }

    # -------------------------------------------------------- download folders

    def _poll_download_folders(self, deadline: float) -> list[dict]:
        events: list[dict] = []
        now_ts = time.time()
        floor = self._state["scan_floor"]
        reported = self._state["reported_files"]
        known = self._state["known_download_paths"]

        for folder, is_downloads in _watched_folders():
            try:
                entries = list(os.scandir(folder))
            except OSError:
                continue

            for entry in entries:
                try:
                    if not entry.is_file(follow_symlinks=False):
                        continue

                    name = entry.name
                    lowered = name.lower()

                    if (
                        lowered.endswith(_SKIP_SUFFIXES)
                        or lowered in _SKIP_NAMES
                        or name.startswith("~$")
                    ):
                        continue

                    stat = entry.stat()
                except OSError:
                    continue

                if stat.st_mtime < floor:
                    continue

                if now_ts - stat.st_mtime < NEW_FILE_GRACE_SECONDS:
                    continue

                path = entry.path
                key = _norm(path)
                signature = f"{int(stat.st_mtime)}|{stat.st_size}"

                if reported.get(key) == signature:
                    continue

                if key in known:
                    reported[key] = signature
                    continue

                zone = _read_zone_identifier(path)

                if not is_downloads and zone.get("zone_id") not in (3, 4):
                    reported[key] = signature
                    continue

                try:
                    sha256 = _sha256(path, DOWNLOAD_HASH_MAX_BYTES, deadline)
                except _HashBudgetExceeded:
                    return events  # resume on the next poll

                source_url, source_domain = clean_url(zone.get("host_url"))
                referrer_url, _ = clean_url(zone.get("referrer_url"))

                events.append(
                    {
                        "event_type": "file_downloaded",
                        "occurred_at": _iso(stat.st_mtime),
                        "dedupe_key": _dedupe_key("fd", key, signature),
                        "file_name": name,
                        "file_path": path,
                        "file_size": stat.st_size,
                        "sha256": sha256,
                        "source_url": source_url,
                        "source_domain": source_domain,
                        "referrer_url": referrer_url,
                        "zone_id": zone.get("zone_id"),
                    }
                )

                reported[key] = signature

        return events

    # --------------------------------------------------------------------- USB

    def _usb_bus_letters(self) -> set[str]:
        """
        Drive letters of USB-attached disks, including external HDD/SSDs
        that Windows reports as "fixed" (psutil cannot see those as removable).

        Cached; on failure the previous answer is kept so a slow or failed
        query cannot cause false "removed" events.
        """
        if sys.platform != "win32":
            return set()

        if time.monotonic() - self._bus_checked < USB_BUS_QUERY_SECONDS:
            return self._bus_letters

        self._bus_checked = time.monotonic()

        script = (
            "Get-Disk | Where-Object { $_.BusType -eq 'USB' } "
            "| Get-Partition | Where-Object { $_.DriveLetter } "
            "| ForEach-Object { [string]$_.DriveLetter } "
            "| ConvertTo-Json -Compress"
        )

        try:
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-NonInteractive",
                 "-Command", script],
                capture_output=True,
                text=True,
                timeout=15,
                check=True,
                creationflags=_CREATE_NO_WINDOW,
            )

            output = result.stdout.strip()
            data = json.loads(output) if output else []

            if isinstance(data, str):
                data = [data]

            self._bus_letters = {
                f"{str(letter).upper()}:" for letter in data if letter
            }

        except (subprocess.SubprocessError, OSError, ValueError):
            pass  # keep previous value

        return self._bus_letters

    def _current_usb_drives(self) -> dict[str, str]:
        """Map drive letter ("E:") -> root ("E:\\") for USB/removable drives."""
        drives: dict[str, str] = {}

        try:
            partitions = psutil.disk_partitions(all=False)
        except OSError:
            partitions = []

        for partition in partitions:
            if "removable" in (partition.opts or "").lower():
                letter = partition.mountpoint[:2].upper()
                drives[letter] = partition.mountpoint

        for letter in self._usb_bus_letters():
            drives.setdefault(letter, f"{letter}\\")

        return drives

    def _poll_usb(self, deadline: float) -> list[dict]:
        events: list[dict] = []
        now_ts = time.time()
        current = self._current_usb_drives()
        announce = self._usb_initialised  # drives present at startup are baseline

        for letter, root in current.items():
            if letter in self._usb:
                continue

            info = _volume_info(root)

            self._usb[letter] = {
                "root": root,
                "label": info.get("label"),
                "serial": info.get("serial"),
                "fs_type": info.get("fs_type"),
                # Poll gap + slack, so files copied right after insertion
                # (before we noticed the drive) are still caught.
                "birth_floor": now_ts - (POLL_INTERVAL_SECONDS + 60),
                "reported": {},
            }

            if announce:
                events.append(self._usb_event("usb_inserted", letter, now_ts))

        for letter in list(self._usb):
            if letter not in current:
                if announce:
                    events.append(self._usb_event("usb_removed", letter, now_ts))

                del self._usb[letter]

        self._usb_initialised = True

        for letter, info in self._usb.items():
            events.extend(self._scan_usb(letter, info, deadline))

        return events

    def _usb_event(self, event_type: str, letter: str, now_ts: float) -> dict:
        info = self._usb.get(letter) or {}

        return {
            "event_type": event_type,
            "occurred_at": _iso(now_ts),
            "dedupe_key": _dedupe_key(
                event_type, info.get("serial") or letter, letter, int(now_ts)
            ),
            "drive_letter": letter,
            "volume_label": info.get("label"),
            "volume_serial": info.get("serial"),
            "fs_type": info.get("fs_type"),
        }

    def _scan_usb(self, letter: str, info: dict, deadline: float) -> list[dict]:
        events: list[dict] = []
        reported = info["reported"]
        visited = 0
        scan_deadline = time.monotonic() + USB_SCAN_BUDGET_SECONDS
        stack = [info["root"]]

        while stack and visited < USB_SCAN_MAX_ENTRIES:
            if time.monotonic() > scan_deadline:
                break

            directory = stack.pop()

            try:
                iterator = os.scandir(directory)
            except OSError:
                continue

            with iterator:
                for entry in iterator:
                    visited += 1

                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if entry.name.lower() not in _USB_SKIP_DIRS:
                                stack.append(entry.path)
                            continue

                        if not entry.is_file(follow_symlinks=False):
                            continue

                        stat = entry.stat()
                    except OSError:
                        continue

                    # Windows keeps the original modified time on copy but
                    # stamps a fresh creation time, so creation time tells
                    # us when the file landed on this drive.
                    created = getattr(stat, "st_birthtime", None) or stat.st_ctime

                    if created < info["birth_floor"]:
                        continue

                    key = _norm(entry.path)
                    signature = f"{int(stat.st_mtime)}|{stat.st_size}"

                    if reported.get(key) == signature:
                        continue

                    try:
                        sha256 = _sha256(entry.path, USB_HASH_MAX_BYTES, deadline)
                    except _HashBudgetExceeded:
                        return events

                    events.append(
                        {
                            "event_type": "usb_file_written",
                            "occurred_at": _iso(created),
                            "dedupe_key": _dedupe_key(
                                "uf",
                                info.get("serial") or letter,
                                key,
                                signature,
                            ),
                            "file_name": entry.name,
                            "file_path": entry.path,
                            "file_size": stat.st_size,
                            "sha256": sha256,
                            "drive_letter": letter,
                            "volume_label": info.get("label"),
                            "volume_serial": info.get("serial"),
                            "fs_type": info.get("fs_type"),
                        }
                    )

                    reported[key] = signature

        if len(reported) > MAX_REMEMBERED_KEYS:
            info["reported"] = dict(list(reported.items())[-MAX_REMEMBERED_KEYS:])

        return events