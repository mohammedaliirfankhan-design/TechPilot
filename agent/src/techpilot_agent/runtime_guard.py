"""
Startup hardening for the TechAIPILOT agent.

Typical boot-time failures this module removes:

1. Network not ready yet at logon -> the first HTTP call raises
   ConnectionError and the agent dies with a traceback.
2. Render free/starter instances sleep when idle. The first request
   after boot can take 30-60s while the backend wakes up; the old
   10s timeout on register_agent() made startup fail.
3. Two copies of the agent (Startup folder + Run key + scheduled
   task) fighting over the same device and remote session.
4. Console "QuickEdit" mode: clicking inside the agent's terminal
   window pauses the whole process until a key is pressed. Remote
   input and the stream freeze while that happens.
5. Any unexpected exception killing the agent for good.

Usage in the agent's entry point (see INTEGRATION.md):

    from techpilot_agent.runtime_guard import (
        prepare_runtime, wait_for_backend, run_forever,
    )

    def main():
        prepare_runtime()
        wait_for_backend(BACKEND_URL)
        run_forever(start_agent)   # your existing main loop
"""

from __future__ import annotations

import ctypes
import logging
import os
import sys
import time
from pathlib import Path

import requests


APP_NAME = "TechAIPILOT"
MUTEX_NAME = "Local\\TechAIPILOT_Agent_SingleInstance"
ERROR_ALREADY_EXISTS = 183

LOG_DIR = (
    Path(os.getenv("PROGRAMDATA", r"C:\ProgramData"))
    / APP_NAME
    / "logs"
)

logger = logging.getLogger(APP_NAME)

_mutex_handle = None


# ---------------------------------------------------------------
# SINGLE INSTANCE
# ---------------------------------------------------------------

def ensure_single_instance() -> None:
    global _mutex_handle

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.restype = ctypes.c_void_p

    handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    error = ctypes.get_last_error()

    if not handle:
        return  # cannot create mutex; do not block startup

    if error == ERROR_ALREADY_EXISTS:
        print(
            "[AGENT] Another TechAIPILOT agent is already running. Exiting.",
            flush=True,
        )
        sys.exit(0)

    _mutex_handle = handle  # keep alive for the process lifetime


# ---------------------------------------------------------------
# CONSOLE QUICKEDIT
# ---------------------------------------------------------------

def disable_console_quick_edit() -> None:
    try:
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-10)  # STD_INPUT_HANDLE
        mode = ctypes.c_uint32()

        if not kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            return  # no console attached (windowed build)

        ENABLE_QUICK_EDIT_MODE = 0x0040
        ENABLE_EXTENDED_FLAGS = 0x0080

        new_mode = (mode.value | ENABLE_EXTENDED_FLAGS) & ~ENABLE_QUICK_EDIT_MODE
        kernel32.SetConsoleMode(handle, new_mode)

    except Exception:
        pass


def set_console_title() -> None:
    try:
        ctypes.windll.kernel32.SetConsoleTitleW(
            "TechAIPILOT Agent - do not close"
        )
    except Exception:
        pass


# ---------------------------------------------------------------
# STD STREAMS (windowed / --noconsole builds)
# ---------------------------------------------------------------

def ensure_std_streams() -> None:
    """
    In a PyInstaller --noconsole build sys.stdout / sys.stderr are
    None and some libraries crash when they write to them. Send them
    to a file instead.
    """
    if sys.stdout is not None and sys.stderr is not None:
        return

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stream = open(
        LOG_DIR / "agent-console.log",
        "a",
        encoding="utf-8",
        buffering=1,
    )

    if sys.stdout is None:
        sys.stdout = stream
    if sys.stderr is None:
        sys.stderr = stream


# ---------------------------------------------------------------
# PUBLIC
# ---------------------------------------------------------------

def prepare_runtime() -> None:
    ensure_std_streams()
    ensure_single_instance()
    disable_console_quick_edit()
    set_console_title()


def wait_for_backend(
    backend_url: str,
    max_delay: float = 60.0,
) -> None:
    """
    Block until the backend answers /health.

    Handles both "network not up yet" after boot and a sleeping
    Render instance (read timeout is long enough for a cold start).
    """
    url = backend_url.rstrip("/") + "/health"
    delay = 2.0
    attempt = 0

    while True:
        attempt += 1
        try:
            response = requests.get(url, timeout=(5, 75))
            if response.ok:
                print(
                    f"[AGENT] Backend reachable (attempt {attempt}).",
                    flush=True,
                )
                return
            reason = f"HTTP {response.status_code}"
        except requests.RequestException as exc:
            reason = f"{type(exc).__name__}"

        message = (
            f"[AGENT] Backend not reachable yet ({reason}). "
            f"Retrying in {int(delay)}s..."
        )
        print(message, flush=True)
        logger.warning(message)

        time.sleep(delay)
        delay = min(delay * 2, max_delay)


def run_forever(target, *args, **kwargs) -> None:
    """
    Run target() and restart it whenever it raises or returns.
    The agent therefore never stays down after a transient error.
    """
    delay = 5.0

    while True:
        started = time.monotonic()

        try:
            target(*args, **kwargs)
            print("[AGENT] Main loop returned; restarting.", flush=True)

        except KeyboardInterrupt:
            raise

        except SystemExit as exc:
            if exc.code in (0, None):
                raise
            logger.exception("Agent main loop exited with %s", exc.code)

        except Exception:
            logger.exception("Agent main loop crashed")
            print(
                "[AGENT] Main loop crashed (details in agent.log). "
                f"Restarting in {int(delay)}s...",
                flush=True,
            )

        # Reset backoff if it ran fine for a while
        if time.monotonic() - started > 300:
            delay = 5.0

        time.sleep(delay)
        delay = min(delay * 2, 60.0)
