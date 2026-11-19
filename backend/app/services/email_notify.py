# email-notify-version: 1
"""
Emails admins about new file findings.

How it works
------------
A background thread starts with the API. Every couple of minutes it looks for
findings that have not been emailed and have been quiet for a few minutes
(so a burst of activity becomes one email), then sends one digest per
organization and marks those findings as emailed. A failed send is retried a
few times, each retry after another quiet period (so a mail outage gets about
25 minutes of retries with the defaults), and the problem is shown in the status.

Two ways to send (pick one by setting its variables in Render):

  Microsoft Graph (works on any hosting plan, over HTTPS)
      GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
      GRAPH_SENDER          mailbox the mail is sent from, e.g. alerts@yourcompany.com
      (the Azure app needs the "Mail.Send" application permission)

  SMTP (Render blocks outgoing SMTP on free plans; paid plans and other
  hosts are fine)
      SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASSWORD
      EMAIL_FROM            defaults to SMTP_USER
      SMTP_STARTTLS=true    (default), or SMTP_SSL=true for port 465

Who receives it:
      FINDINGS_EMAIL_TO     comma-separated addresses
      FINDINGS_EMAIL_TO_ORG_<id>   optional list for one organization only
      Until organizations have their own settings, every organization's
      findings go to FINDINGS_EMAIL_TO unless a per-organization list is set.

Optional:
      FINDINGS_EMAIL_QUIET_SECONDS (300)   wait this long after the last change
      FINDINGS_EMAIL_INTERVAL_SECONDS (120)
      FINDINGS_EMAIL_MAX_PER_DIGEST (25)
      FINDINGS_EMAIL_MAX_ATTEMPTS (5)
      CONSOLE_URL           link shown in the email

Passwords and secrets are never logged or shown in the status.
"""

from __future__ import annotations

import html
import json
import logging
import os
import re
import smtplib
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any, Callable

logger = logging.getLogger("TechAIPILOT.email_notify")

HTTP_TIMEOUT_SECONDS = 20
FIRST_RUN_DELAY_SECONDS = 60
TEST_EMAIL_MIN_GAP_SECONDS = 30

_ADDRESS = re.compile(r"^[^@\s,;<>\"']+@[^@\s,;<>\"']+\.[^@\s,;<>\"']+$")

_lock = threading.Lock()
_stop = threading.Event()
_thread: threading.Thread | None = None
_token_cache: dict[str, Any] = {"token": None, "expires_at": 0.0, "key": None}

_state: dict[str, Any] = {
    "running": False,
    "last_sent_at": None,
    "last_error": None,
    "total_sent": 0,
    "last_test_at": 0.0,
}


class EmailError(Exception):
    """A send failed. The message is safe to show to an admin (no secrets)."""


class TooSoon(Exception):
    """A test email was requested again too quickly."""


# ---------------------------------------------------------------- settings

def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(_env(name)) if _env(name) else default
    except ValueError:
        value = default

    return max(minimum, min(maximum, value))


def _graph_ready() -> bool:
    return all(_env(n) for n in ("GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_SENDER"))


def _smtp_ready() -> bool:
    return bool(_env("SMTP_HOST") and (_env("EMAIL_FROM") or _env("SMTP_USER")))


def provider() -> str | None:
    """'graph', 'smtp' or None when sending is not set up."""
    forced = _env("FINDINGS_EMAIL_PROVIDER").lower()

    if forced == "graph":
        return "graph" if _graph_ready() else None

    if forced == "smtp":
        return "smtp" if _smtp_ready() else None

    if _graph_ready():
        return "graph"

    if _smtp_ready():
        return "smtp"

    return None


def _parse_addresses(raw: str) -> list[str]:
    found: list[str] = []

    for part in re.split(r"[,;\s]+", raw):
        address = part.strip()

        if address and _ADDRESS.match(address) and address.lower() not in (a.lower() for a in found):
            found.append(address)

    return found[:20]


def recipients_for(organization_id: int | None = None) -> list[str]:
    if organization_id is not None:
        specific = _env(f"FINDINGS_EMAIL_TO_ORG_{organization_id}")

        if specific:
            return _parse_addresses(specific)

    return _parse_addresses(_env("FINDINGS_EMAIL_TO"))


def _any_recipients() -> bool:
    """True if any recipient list is set (global or for one organization)."""
    for name, value in os.environ.items():
        if name == "FINDINGS_EMAIL_TO" or name.startswith("FINDINGS_EMAIL_TO_ORG_"):
            if _parse_addresses(value):
                return True

    return False


def _clean_line(text: Any, limit: int = 200) -> str:
    """One safe line of text: no line breaks or control characters."""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", str(text or "")).strip()[:limit]


# ----------------------------------------------------------------- sending

def _http(method: str, url: str, body: bytes | None, headers: dict[str, str]) -> tuple[int, bytes]:
    request = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return response.status, response.read(200_000)

    except urllib.error.HTTPError as error:
        return error.code, error.read(20_000)

    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise EmailError(f"Could not reach the mail service ({type(error).__name__}).") from error


def _graph_token() -> str:
    tenant = _env("GRAPH_TENANT_ID")
    client = _env("GRAPH_CLIENT_ID")
    key = f"{tenant}|{client}"

    with _lock:
        if _token_cache["key"] == key and _token_cache["token"] and time.time() < _token_cache["expires_at"]:
            return _token_cache["token"]

    base = _env("GRAPH_LOGIN_BASE") or "https://login.microsoftonline.com"
    form = urllib.parse.urlencode(
        {
            "client_id": client,
            "client_secret": _env("GRAPH_CLIENT_SECRET"),
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        }
    ).encode()

    status, payload = _http(
        "POST",
        f"{base}/{urllib.parse.quote(tenant)}/oauth2/v2.0/token",
        form,
        {"Content-Type": "application/x-www-form-urlencoded"},
    )

    try:
        data = json.loads(payload or b"{}")
    except ValueError:
        data = {}

    if status != 200 or not data.get("access_token"):
        reason = _clean_line(data.get("error_description") or data.get("error") or f"HTTP {status}", 160)
        raise EmailError(f"Microsoft sign-in failed: {reason}")

    with _lock:
        _token_cache.update(
            token=data["access_token"],
            expires_at=time.time() + max(60, int(data.get("expires_in", 3600)) - 120),
            key=key,
        )

    return data["access_token"]


def _send_graph(subject: str, text: str, html_body: str, to: list[str]) -> None:
    token = _graph_token()
    base = _env("GRAPH_API_BASE") or "https://graph.microsoft.com"
    sender = urllib.parse.quote(_env("GRAPH_SENDER"))

    message = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html_body},
            "toRecipients": [{"emailAddress": {"address": address}} for address in to],
        },
        "saveToSentItems": False,
    }

    status, payload = _http(
        "POST",
        f"{base}/v1.0/users/{sender}/sendMail",
        json.dumps(message).encode(),
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )

    if status == 401:
        with _lock:
            _token_cache["token"] = None

    if status not in (200, 202):
        try:
            detail = json.loads(payload or b"{}").get("error", {}).get("message", "")
        except ValueError:
            detail = ""

        raise EmailError(f"Microsoft Graph refused the email (HTTP {status}). {_clean_line(detail, 160)}".strip())


def _send_smtp(subject: str, text: str, html_body: str, to: list[str]) -> None:
    sender = _env("EMAIL_FROM") or _env("SMTP_USER")
    host = _env("SMTP_HOST")
    port = _int_env("SMTP_PORT", 587, 1, 65535)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = ", ".join(to)
    message.set_content(text)
    message.add_alternative(html_body, subtype="html")

    use_ssl = _env("SMTP_SSL").lower() in ("1", "true", "yes")
    use_starttls = _env("SMTP_STARTTLS").lower() not in ("0", "false", "no")

    try:
        if use_ssl:
            server: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=HTTP_TIMEOUT_SECONDS, context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(host, port, timeout=HTTP_TIMEOUT_SECONDS)

        with server:
            if use_starttls and not use_ssl:
                server.starttls(context=ssl.create_default_context())

            if _env("SMTP_USER"):
                server.login(_env("SMTP_USER"), _env("SMTP_PASSWORD"))

            server.send_message(message)

    except smtplib.SMTPAuthenticationError as error:
        raise EmailError("The mail server rejected the user name or password.") from error

    except (smtplib.SMTPException, OSError) as error:
        raise EmailError(f"Could not send through the mail server ({type(error).__name__}).") from error


def send_email(subject: str, text: str, html_body: str, to: list[str]) -> None:
    """Send one email with whichever method is set up."""
    method = provider()

    if method is None:
        raise EmailError("Email is not set up yet. Add the sending settings in Render's Environment tab.")

    if not to:
        raise EmailError("No recipients are set. Add addresses to FINDINGS_EMAIL_TO.")

    subject = _clean_line(subject)

    if method == "graph":
        _send_graph(subject, text, html_body, to)
    else:
        _send_smtp(subject, text, html_body, to)


# ------------------------------------------------------------------ digest

def build_digest(items: list[dict], console_url: str | None = None) -> tuple[str, str, str]:
    """
    items: dicts with device, title, detail, when. Returns (subject, text, html).
    Everything that came from a PC (file names, host names) is escaped.
    """
    devices: list[str] = []

    for item in items:
        name = _clean_line(item.get("device"), 80) or "a device"

        if name not in devices:
            devices.append(name)

    count = len(items)
    plural = "" if count == 1 else "s"
    where = devices[0] if len(devices) == 1 else f"{len(devices)} devices"
    subject = f"[TechAIPILOT] {count} new file finding{plural} on {where}"

    text_lines = [f"{count} new finding{plural} about downloads and USB use:", ""]
    html_rows: list[str] = []

    for device in devices:
        text_lines.append(device)
        html_rows.append(f'<h3 style="margin:18px 0 6px;font-size:15px">{html.escape(device)}</h3><ul style="margin:0;padding-left:20px">')

        for item in items:
            if (_clean_line(item.get("device"), 80) or "a device") != device:
                continue

            title = _clean_line(item.get("title"), 200)
            detail = _clean_line(item.get("detail"), 300)
            when = _clean_line(item.get("when"), 40)

            text_lines.append(f"  - {title}" + (f" ({detail})" if detail else "") + (f" [{when}]" if when else ""))
            html_rows.append(
                "<li style=\"margin:6px 0\"><strong>" + html.escape(title) + "</strong>"
                + (f'<br><span style="color:#555">{html.escape(detail)}</span>' if detail else "")
                + (f' <span style="color:#888">· {html.escape(when)}</span>' if when else "")
                + "</li>"
            )

        text_lines.append("")
        html_rows.append("</ul>")

    footer_text = "Only file names, sizes and sources are recorded, never what is inside the files."

    if console_url:
        text_lines.append(f"Open the console: {console_url}")
        link = f'<p><a href="{html.escape(console_url, quote=True)}">Open the console</a></p>'
    else:
        link = ""

    text_lines.append(footer_text)

    body = (
        '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222">'
        f"<p>{count} new finding{plural} about downloads and USB use:</p>"
        + "".join(html_rows)
        + link
        + f'<p style="color:#888;font-size:12px">{html.escape(footer_text)}</p></div>'
    )

    return subject, "\n".join(text_lines), body


# ------------------------------------------------------------------ status

def _record(**values: Any) -> None:
    with _lock:
        _state.update(values)


def email_status() -> dict[str, Any]:
    """What an admin can see about email: set up or not, last result. No secrets."""
    with _lock:
        snapshot = dict(_state)

    last_sent = snapshot["last_sent_at"]

    return {
        "configured": provider() is not None and bool(recipients_for(None)),
        "provider": provider(),
        "recipients": len(recipients_for(None)),
        "running": snapshot["running"],
        "last_sent_at": last_sent.isoformat(timespec="seconds") if last_sent else None,
        "last_error": snapshot["last_error"],
        "total_sent": snapshot["total_sent"],
    }


def send_test_email(organization_id: int | None = None) -> dict[str, Any]:
    """Send a short test email so an admin can check the setup."""
    now = time.monotonic()

    with _lock:
        if now - _state["last_test_at"] < TEST_EMAIL_MIN_GAP_SECONDS:
            raise TooSoon("A test email was just sent. Wait a few seconds and try again.")

        _state["last_test_at"] = now

    to = recipients_for(organization_id)
    subject, text, body = build_digest(
        [{"device": "Test", "title": "This is a test email from TechAIPILOT", "detail": "If you can read this, finding emails will reach you.", "when": "now"}],
        _env("CONSOLE_URL") or None,
    )
    send_email("[TechAIPILOT] Test email", text, body, to)

    return {"sent": True, "recipients": len(to), "provider": provider()}


# ---------------------------------------------------------- the background job

def notify_pending(session_factory: Callable[[], Any], now: datetime | None = None) -> int:
    """One pass: email what is waiting. Returns how many findings were emailed."""
    from app.models.agent import Agent
    from app.models.file_finding import FileFinding

    if provider() is None:
        return 0

    now = now or datetime.now(timezone.utc)
    quiet = _int_env("FINDINGS_EMAIL_QUIET_SECONDS", 300, 0, 86_400)
    max_items = _int_env("FINDINGS_EMAIL_MAX_PER_DIGEST", 25, 1, 100)
    max_attempts = _int_env("FINDINGS_EMAIL_MAX_ATTEMPTS", 5, 1, 50)
    console_url = _env("CONSOLE_URL") or None
    sent_total = 0

    waiting = (
        FileFinding.notified_at.is_(None),
        FileFinding.notify_attempts < max_attempts,
        FileFinding.updated_at <= now - timedelta(seconds=quiet),
    )

    with session_factory() as db:
        organizations = [row[0] for row in db.query(FileFinding.organization_id).filter(*waiting).distinct().all()]

        for organization_id in organizations:
            to = recipients_for(organization_id)

            if not to:
                continue

            rows = (
                db.query(FileFinding, Agent.hostname, Agent.display_name)
                .join(Agent, Agent.device_id == FileFinding.device_id)
                .filter(FileFinding.organization_id == organization_id, *waiting)
                .order_by(FileFinding.id)
                .limit(max_items)
                .all()
            )

            if not rows:
                continue

            items = [
                {
                    "device": display_name or hostname,
                    "title": finding.title,
                    "detail": finding.detail,
                    "when": finding.last_seen_at.strftime("%d %b %H:%M UTC") if finding.last_seen_at else "",
                }
                for finding, hostname, display_name in rows
            ]
            subject, text, body = build_digest(items, console_url)

            try:
                send_email(subject, text, body, to)

            except EmailError as error:
                message = str(error)[:300]

                for finding, _hostname, _display in rows:
                    finding.notify_attempts = (finding.notify_attempts or 0) + 1
                    finding.notify_error = message

                db.commit()
                _record(last_error=message)
                logger.warning("Finding email failed: %s", message)
                continue

            for finding, _hostname, _display in rows:
                finding.notified_at = now
                finding.notify_error = None

            db.commit()
            sent_total += len(rows)

            with _lock:
                _state["last_sent_at"] = now
                _state["last_error"] = None
                _state["total_sent"] += len(rows)

    return sent_total


def _loop(session_factory: Callable[[], Any]) -> None:
    delay = float(FIRST_RUN_DELAY_SECONDS)

    while not _stop.is_set():
        if _stop.wait(delay):
            break

        try:
            notify_pending(session_factory)
        except Exception as exc:  # noqa: BLE001 - the sender must never stop the API
            _record(last_error=_clean_line(f"{type(exc).__name__}: {exc}", 300))
            logger.warning("Finding email pass failed: %s", exc)

        delay = float(_int_env("FINDINGS_EMAIL_INTERVAL_SECONDS", 120, 5, 86_400))

    _record(running=False)


def start_findings_notifier(session_factory: Callable[[], Any] | None = None) -> None:
    """Start the background email sender. Does nothing if email is not set up."""
    global _thread

    if provider() is None or not _any_recipients():
        logger.info("Finding emails are off: sending settings or recipients are not set.")
        return

    with _lock:
        if _thread is not None and _thread.is_alive():
            return

    if session_factory is None:
        try:
            from app.database import SessionLocal
        except Exception as exc:  # noqa: BLE001 - never stop the API from starting
            logger.warning("Finding emails not started: %s", exc)
            return

        session_factory = SessionLocal

    _stop.clear()
    _record(running=True)

    _thread = threading.Thread(target=_loop, args=(session_factory,), name="findings-notifier", daemon=True)
    _thread.start()


def stop_findings_notifier() -> None:
    """Stop the background sender (used by tests)."""
    _stop.set()

    if _thread is not None:
        _thread.join(timeout=2)
