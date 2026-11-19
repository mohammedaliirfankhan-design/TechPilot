# runtime-guard-version: 2
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
6. The console window stalling for any reason (selection mode, a held
   output buffer): printing goes through a non-blocking stream so the
   agent keeps working.

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

import atexit
import ctypes
import io
import logging
import os
import queue
import sys
import threading
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

def _clear_quick_edit(kernel32, handle) -> bool:
    """Clear QuickEdit on one console input handle. True if it was a console."""
    from ctypes import wintypes

    ENABLE_QUICK_EDIT_MODE = 0x0040
    ENABLE_EXTENDED_FLAGS = 0x0080

    mode = wintypes.DWORD()

    if not kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
        return False

    new_mode = (mode.value | ENABLE_EXTENDED_FLAGS) & ~ENABLE_QUICK_EDIT_MODE
    kernel32.SetConsoleMode(handle, new_mode)
    return True


def disable_console_quick_edit() -> None:
    """
    Stop a click inside the agent's console window from freezing the agent.

    The old version looked the console up through "standard input". When the
    agent is started with its input redirected (a launcher, a scheduled
    task), that handle is not the console, the call quietly did nothing and
    QuickEdit stayed on. Opening CONIN$ reaches the window's own input buffer
    whatever the standard handles point to.
    """
    if sys.platform != "win32":
        return

    try:
        from ctypes import wintypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

        kernel32.CreateFileW.restype = wintypes.HANDLE
        kernel32.CreateFileW.argtypes = [
            wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
            wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE,
        ]
        kernel32.GetConsoleMode.argtypes = [
            wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD),
        ]
        kernel32.SetConsoleMode.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]

        GENERIC_READ = 0x80000000
        GENERIC_WRITE = 0x40000000
        FILE_SHARE_READ = 0x1
        FILE_SHARE_WRITE = 0x2
        OPEN_EXISTING = 3
        invalid = ctypes.c_void_p(-1).value

        handle = kernel32.CreateFileW(
            "CONIN$",
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            0,
            None,
        )

        if handle not in (None, 0, invalid):
            try:
                if _clear_quick_edit(kernel32, handle):
                    return
            finally:
                kernel32.CloseHandle(handle)

        # No console reachable that way: fall back to the standard input
        # handle (the original behaviour).
        kernel32.GetStdHandle.restype = wintypes.HANDLE
        _clear_quick_edit(kernel32, kernel32.GetStdHandle(-10))

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
# NEVER LET THE CONSOLE FREEZE THE AGENT
# ---------------------------------------------------------------

class _NonBlockingStream:
    """
    Stands in for sys.stdout / sys.stderr.

    Writes go onto a small queue and a background thread hands them to the
    real stream. If the real stream stalls (the console window is in text
    selection mode, or something is holding it), the agent keeps running and
    the oldest lines are dropped, instead of the whole program freezing on
    its next print().
    """

    def __init__(self, target, max_items: int = 2000):
        self._target = target
        self._queue: "queue.Queue[str]" = queue.Queue(maxsize=max_items)
        self.encoding = getattr(target, "encoding", None) or "utf-8"
        self.errors = "replace"

        threading.Thread(
            target=self._pump,
            name="console-writer",
            daemon=True,
        ).start()

    # -- file-like interface ------------------------------------

    def write(self, text) -> int:
        if isinstance(text, bytes):
            text = text.decode("utf-8", "replace")
        elif not isinstance(text, str):
            text = str(text)

        if not text:
            return 0

        try:
            self._queue.put_nowait(text)
        except queue.Full:
            # Drop the oldest line to make room; never wait.
            try:
                self._queue.get_nowait()
                self._queue.task_done()
            except queue.Empty:
                pass

            try:
                self._queue.put_nowait(text)
            except queue.Full:
                pass

        return len(text)

    def flush(self) -> None:
        return None

    def isatty(self) -> bool:
        return False

    def readable(self) -> bool:
        return False

    def writable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return False

    def fileno(self) -> int:
        raise io.UnsupportedOperation("fileno")

    def close(self) -> None:
        return None

    @property
    def closed(self) -> bool:
        return False

    # -- helpers --------------------------------------------------

    def drain(self, timeout: float = 1.0) -> None:
        """Give queued lines a moment to reach the console (used at exit)."""
        deadline = time.monotonic() + timeout

        while self._queue.unfinished_tasks and time.monotonic() < deadline:
            time.sleep(0.02)

    def _pump(self) -> None:
        while True:
            text = self._queue.get()

            try:
                if self._target is not None:
                    try:
                        self._target.write(text)
                        self._target.flush()
                    except UnicodeEncodeError:
                        self._target.write(
                            text.encode("ascii", "replace").decode("ascii")
                        )
                        self._target.flush()
            except Exception:
                pass  # a broken console must never hurt the agent
            finally:
                self._queue.task_done()


_nonblocking_installed = False


def install_nonblocking_console() -> None:
    """Route print() and logging output through a stream that cannot block."""
    global _nonblocking_installed

    if _nonblocking_installed:
        return

    for name in ("stdout", "stderr"):
        stream = getattr(sys, name, None)

        if stream is None or isinstance(stream, _NonBlockingStream):
            continue

        wrapped = _NonBlockingStream(stream)
        setattr(sys, name, wrapped)
        atexit.register(wrapped.drain, 1.0)

    _nonblocking_installed = True


# ---------------------------------------------------------------
# PUBLIC
# ---------------------------------------------------------------

def prepare_runtime() -> None:
    ensure_std_streams()
    install_nonblocking_console()
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
