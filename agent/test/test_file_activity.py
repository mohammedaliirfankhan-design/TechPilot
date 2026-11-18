"""
Tests for file_activity.py. Runs on any OS: Windows-only pieces
(Zone.Identifier, volume info, PowerShell USB lookup) are stubbed.

    PYTHONPATH=src python -m pytest test/test_file_activity.py -v
"""

import hashlib
import os
import sqlite3
import time
from pathlib import Path

import pytest

from techpilot_agent.network import file_activity as fa


# --------------------------------------------------------------------- helpers

def make_history(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE downloads (id INTEGER PRIMARY KEY, guid VARCHAR, "
        "target_path TEXT, start_time INTEGER, end_time INTEGER, "
        "total_bytes INTEGER, received_bytes INTEGER, state INTEGER, "
        "danger_type INTEGER, tab_url TEXT, referrer TEXT, mime_type TEXT)"
    )
    con.execute(
        "CREATE TABLE downloads_url_chains (id INTEGER, chain_index INTEGER, "
        "url LONGVARCHAR)"
    )
    for row in rows:
        con.execute(
            "INSERT INTO downloads (id, guid, target_path, start_time, end_time,"
            " total_bytes, received_bytes, state, danger_type, tab_url, referrer,"
            " mime_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                row["id"], row["guid"], row["target"], row["start"], 0,
                row.get("size", 10), row.get("size", 10), row["state"],
                row.get("danger", 0), row.get("tab_url"), None,
                "application/octet-stream",
            ),
        )
        for index, url in enumerate(row.get("chain", [])):
            con.execute(
                "INSERT INTO downloads_url_chains VALUES (?,?,?)",
                (row["id"], index, url),
            )
    con.commit()
    con.close()


@pytest.fixture
def collector(tmp_path, monkeypatch):
    monkeypatch.setattr(fa, "_browser_roots", lambda: {})
    monkeypatch.setattr(fa, "_watched_folders", lambda: [])
    instance = fa.FileActivityCollector(tmp_path / "state")
    monkeypatch.setattr(instance, "_current_usb_drives", lambda: {})
    return instance


# ----------------------------------------------------------------- pure helpers

def test_clean_url_drops_query_credentials_and_fragment():
    url, domain = fa.clean_url(
        "https://user:pw@Files.Example.com:8443/a/b.zip?sig=SECRET&x=1#frag"
    )
    assert url == "https://files.example.com:8443/a/b.zip"
    assert "SECRET" not in url and "pw" not in url
    assert domain == "files.example.com"


def test_clean_url_understands_blob_urls():
    url, domain = fa.clean_url("blob:https://claude.ai/1234-abcd")
    assert domain == "claude.ai"
    assert fa.clean_url("data:text/plain;base64,AAAA") == (None, None)


def test_clean_url_rejects_garbage():
    assert fa.clean_url(None) == (None, None)
    assert fa.clean_url("not a url") == (None, None)


def test_parse_zone_identifier_keeps_percent_encoded_urls():
    text = (
        "[ZoneTransfer]\r\nZoneId=3\r\n"
        "ReferrerUrl=https://example.com/page%20one\r\n"
        "HostUrl=https://cdn.example.com/f.exe?token=a%2Fb\r\n"
    )
    parsed = fa.parse_zone_identifier(text)
    assert parsed["zone_id"] == 3
    assert parsed["host_url"].endswith("token=a%2Fb")
    assert fa.parse_zone_identifier("garbage") == {}


def test_chrome_time_round_trip():
    now = time.time()
    assert abs(fa._chrome_us_to_ts(fa._ts_to_chrome_us(now)) - now) < 1


# -------------------------------------------------------------------- browsers

def test_browser_downloads_events_cursor_and_no_duplicates(
    tmp_path, monkeypatch, collector
):
    downloaded = tmp_path / "report.pdf"
    downloaded.write_bytes(b"hello world")
    expected_hash = hashlib.sha256(b"hello world").hexdigest()

    now = time.time()
    user_data = tmp_path / "chrome"
    make_history(
        user_data / "Default" / "History",
        [
            {   # complete, file exists -> hashed
                "id": 1, "guid": "g1", "target": str(downloaded),
                "start": fa._ts_to_chrome_us(now - 600), "state": 1,
                "size": 11, "tab_url": "https://site.example/dl?t=SECRET",
                "chain": ["https://a.example/x", "https://cdn.example/report.pdf?sig=SECRET"],
            },
            {   # browser flagged as dangerous
                "id": 2, "guid": "g2", "target": str(tmp_path / "bad.exe"),
                "start": fa._ts_to_chrome_us(now - 500), "state": 1, "danger": 2,
                "chain": ["https://evil.example/bad.exe"],
            },
            {   # still downloading -> held back
                "id": 3, "guid": "g3", "target": str(tmp_path / "big.iso"),
                "start": fa._ts_to_chrome_us(now - 30), "state": 0,
                "chain": ["https://x.example/big.iso"],
            },
        ],
    )
    monkeypatch.setattr(fa, "_browser_roots", lambda: {"Chrome": user_data})

    collector._last_browser_poll = float("-inf")
    assert collector.poll() == 2

    events = {e["file_name"]: e for e in collector._state["pending"]}
    report = events["report.pdf"]
    assert report["event_type"] == "browser_download"
    assert report["sha256"] == expected_hash
    assert report["source_url"] == "https://cdn.example/report.pdf"
    assert report["source_domain"] == "cdn.example"
    assert "SECRET" not in str(report)
    assert report["download_state"] == "complete"
    assert report["browser_flagged"] is False
    assert events["bad.exe"]["browser_flagged"] is True
    assert "big.iso" not in events  # in progress, not reported yet

    # Second poll: nothing new, in-progress row still held, no duplicates.
    collector._last_browser_poll = float("-inf")
    assert collector.poll() == 0

    # The held download completes -> reported exactly once.
    con = sqlite3.connect(user_data / "Default" / "History")
    con.execute("UPDATE downloads SET state = 1 WHERE id = 3")
    con.commit()
    con.close()
    collector._last_browser_poll = float("-inf")
    assert collector.poll() == 1
    collector._last_browser_poll = float("-inf")
    assert collector.poll() == 0


def test_in_page_downloads_fall_back_to_the_page_domain(
    tmp_path, monkeypatch, collector
):
    user_data = tmp_path / "chrome"
    make_history(
        user_data / "Default" / "History",
        [
            {   # blob: download with no usable host -> use the tab's page
                "id": 1, "guid": "g1", "target": str(tmp_path / "doc.docx"),
                "start": fa._ts_to_chrome_us(time.time() - 600), "state": 1,
                "tab_url": "https://docs.google.com/document/d/abc/edit?x=1",
                "chain": ["data:application/octet-stream;base64,AAAA"],
            },
        ],
    )
    monkeypatch.setattr(fa, "_browser_roots", lambda: {"Chrome": user_data})

    collector._last_browser_poll = float("-inf")
    assert collector.poll() == 1
    event = collector._state["pending"][0]
    assert event["source_domain"] == "docs.google.com"
    assert "x=1" not in str(event)


def test_missing_or_corrupt_history_is_ignored(tmp_path, monkeypatch, collector):
    user_data = tmp_path / "chrome"
    (user_data / "Default").mkdir(parents=True)
    (user_data / "Default" / "History").write_bytes(b"not a database")
    monkeypatch.setattr(fa, "_browser_roots", lambda: {"Chrome": user_data})

    collector._last_browser_poll = float("-inf")
    assert collector.poll() == 0


# ------------------------------------------------------------ download folders

def test_download_folder_scan(tmp_path, monkeypatch, collector):
    downloads = tmp_path / "Downloads"
    desktop = tmp_path / "Desktop"
    downloads.mkdir()
    desktop.mkdir()
    monkeypatch.setattr(
        fa, "_watched_folders", lambda: [(downloads, True), (desktop, False)]
    )

    old = time.time() - 600

    def make(folder, name, content=b"data"):
        path = folder / name
        path.write_bytes(content)
        os.utime(path, (old, old))
        return path

    make(downloads, "settled.zip")
    make(downloads, "explained_by_browser.zip")
    make(downloads, "partial.crdownload")
    make(desktop, "no_origin.docx")
    make(desktop, "from_internet.xlsx")
    fresh = downloads / "just_arrived.zip"
    fresh.write_bytes(b"x")  # inside the grace period

    collector._state["known_download_paths"][
        fa._norm(str(downloads / "explained_by_browser.zip"))
    ] = 1

    def fake_zone(path):
        if path.endswith("from_internet.xlsx") or path.endswith("settled.zip"):
            return {"zone_id": 3, "host_url": "https://dl.example/f?k=SECRET",
                    "referrer_url": None}
        return {}

    monkeypatch.setattr(fa, "_read_zone_identifier", fake_zone)

    assert collector.poll() == 2
    names = {e["file_name"]: e for e in collector._state["pending"]}
    assert set(names) == {"settled.zip", "from_internet.xlsx"}
    assert names["settled.zip"]["source_domain"] == "dl.example"
    assert "SECRET" not in str(names["settled.zip"])
    assert names["settled.zip"]["sha256"] == hashlib.sha256(b"data").hexdigest()

    # Re-polling does not re-report.
    assert collector.poll() == 0


# ------------------------------------------------------------------------- USB

def test_usb_insert_file_write_and_remove(tmp_path, monkeypatch, collector):
    drive_root = tmp_path / "usb"
    drive_root.mkdir()
    drives: dict[str, str] = {}
    monkeypatch.setattr(collector, "_current_usb_drives", lambda: dict(drives))
    monkeypatch.setattr(
        fa, "_volume_info",
        lambda root: {"label": "BACKUP", "serial": "ABCD1234", "fs_type": "NTFS"},
    )

    # Baseline poll with nothing plugged in.
    assert collector.poll() == 0

    # Plug in a drive and copy a file onto it.
    drives["E:"] = str(drive_root)
    (drive_root / "payroll.xlsx").write_bytes(b"secret numbers")
    (drive_root / "System Volume Information").mkdir()
    (drive_root / "System Volume Information" / "junk.dat").write_bytes(b"x")

    assert collector.poll() == 2
    types = {e["event_type"]: e for e in collector._state["pending"]}
    assert types["usb_inserted"]["volume_serial"] == "ABCD1234"
    written = types["usb_file_written"]
    assert written["file_name"] == "payroll.xlsx"
    assert written["drive_letter"] == "E:"
    assert written["sha256"] == hashlib.sha256(b"secret numbers").hexdigest()

    # Unchanged drive -> nothing new.
    assert collector.poll() == 0

    # Unplug.
    drives.clear()
    assert collector.poll() == 1
    assert collector._state["pending"][-1]["event_type"] == "usb_removed"


def test_drive_present_at_startup_is_not_announced(tmp_path, monkeypatch, collector):
    drive_root = tmp_path / "usb"
    drive_root.mkdir()
    monkeypatch.setattr(
        collector, "_current_usb_drives", lambda: {"F:": str(drive_root)}
    )
    monkeypatch.setattr(fa, "_volume_info", lambda root: {})

    collector.poll()
    assert all(
        e["event_type"] != "usb_inserted" for e in collector._state["pending"]
    )


# ----------------------------------------------------------- queue and delivery

class FakeHTTPError(Exception):
    def __init__(self, status):
        super().__init__(f"HTTP {status}")

        class _Response:
            status_code = status

        self.response = _Response()


def _queue(collector, count):
    collector._state["pending"] = [
        {"event_type": "file_downloaded", "dedupe_key": str(i)} for i in range(count)
    ]


def test_flush_success_batches_and_clears(collector):
    _queue(collector, 450)
    batches = []
    assert collector.flush(batches.append) == 450
    assert [len(b) for b in batches] == [200, 200, 50]
    assert collector._state["pending"] == []


def test_flush_keeps_events_and_backs_off_when_backend_down(collector):
    _queue(collector, 5)

    def down(_batch):
        raise FakeHTTPError(404)  # e.g. backend not deployed yet

    assert collector.flush(down) == 0
    assert len(collector._state["pending"]) == 5
    assert collector._retry_not_before > time.monotonic()

    # While backing off the sender is not even called.
    calls = []
    assert collector.flush(calls.append) == 0 and calls == []


def test_flush_drops_batch_the_backend_rejects_as_invalid(collector):
    _queue(collector, 3)

    def reject(_batch):
        raise FakeHTTPError(422)

    collector.flush(reject)
    assert collector._state["pending"] == []


def test_pending_queue_survives_restart_and_is_capped(tmp_path, collector):
    _queue(collector, fa.MAX_PENDING_EVENTS + 50)
    collector.poll()  # trims to cap and saves
    assert len(collector._state["pending"]) == fa.MAX_PENDING_EVENTS

    reloaded = fa.FileActivityCollector(tmp_path / "state")
    assert len(reloaded._state["pending"]) == fa.MAX_PENDING_EVENTS