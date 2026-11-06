import ctypes
import json
import socket
import struct
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import quote

import websocket
from websocket import WebSocketBadStatusException

from techpilot_agent.config import AGENT_TOKEN

from .flow import drop_link, get_link
from .screen import ScreenCapture


# Every frame is prefixed with a 12 byte header:
#   b"TPF1" | uint32 seq | uint16 width | uint16 height   (big-endian)
# The viewer acks "seq" after drawing it. Older viewers that do not
# understand the header are not supported by this agent version, so
# deploy the frontend change together with the agent.
FRAME_HEADER = struct.Struct("!4sIHH")
FRAME_MAGIC = b"TPF1"

# Flow control
MAX_IN_FLIGHT = 2          # frames sent but not yet drawn by the viewer
ACK_STALL_TIMEOUT = 1.5    # seconds without acks before we resync
KEYFRAME_INTERVAL = 2.0    # resend the screen even if unchanged
IDLE_POLL_INTERVAL = 0.03  # how often to check for changes on a static screen
NO_ACK_FPS = 8             # pacing used if the viewer never acks (old frontend
                           # or a backend that filters frame_ack messages)

# Adaptive quality
QUALITY_MAX = 65
QUALITY_MIN = 30

ENDED_STATUSES = ("ENDED", "CLOSED", "CANCELLED", "TERMINATED")

# Keep the display awake while a session is streaming
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002


def _keep_display_awake(enabled: bool) -> None:
    try:
        flags = ES_CONTINUOUS
        if enabled:
            flags |= ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
        ctypes.windll.kernel32.SetThreadExecutionState(flags)
    except Exception:
        pass


class RemoteScreenStreamer:

    def __init__(
        self,
        server_url: str,
        session_id: int,
        fps: int = 20,
        **_ignored,
    ):
        self.server_url = server_url.rstrip("/")
        self.session_id = session_id
        self.max_fps = max(1, min(int(fps), 30))

        self.websocket = None
        self._ws_lock = threading.Lock()

        self.capture = ScreenCapture(
            monitor=1,
            quality=55,
            max_width=1600,
        )

        self.quality = 55
        self.link = get_link(session_id)

        self.running = True
        self.terminal_failure = False

        self._last_sent_at = 0.0
        self._reader_thread = None

    # =========================================================
    # URLS
    # =========================================================

    def _build_ws_url(self):
        ws_url = (
            self.server_url
            .replace("http://", "ws://")
            .replace("https://", "wss://")
        )
        token = quote(AGENT_TOKEN, safe="")

        return (
            f"{ws_url}/api/v1/remote/sessions/"
            f"{self.session_id}/agent-stream?token={token}"
        )

    def _build_session_url(self):
        return f"{self.server_url}/api/v1/remote/sessions/{self.session_id}"

    # =========================================================
    # SESSION STATUS
    # =========================================================

    def _get_session_status(self):
        try:
            request = urllib.request.Request(
                self._build_session_url(),
                method="GET",
            )
            with urllib.request.urlopen(request, timeout=8) as response:
                data = json.loads(response.read().decode("utf-8"))

            return data.get("status")

        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return "ENDED"
            return None

        except Exception as e:
            print(
                f"[REMOTE] Session status check failed: "
                f"{type(e).__name__}: {e}",
                flush=True,
            )
            return None

    def _session_has_ended(self):
        return self._get_session_status() in ENDED_STATUSES

    # =========================================================
    # CONNECT
    # =========================================================

    def connect(self):
        if self.terminal_failure:
            return False

        url = self._build_ws_url()
        print(f"[REMOTE] Connecting to: {url.split('?')[0]}", flush=True)

        try:
            ws = websocket.create_connection(
                url,
                # Large frames over a slow link can legitimately take
                # more than a second to send. The old value (1s) made
                # every slow send look like a dead connection, which
                # caused reconnect + 2s sleep stalls.
                timeout=15,
                enable_multithread=True,
                sockopt=((socket.IPPROTO_TCP, socket.TCP_NODELAY, 1),),
            )

        except WebSocketBadStatusException as e:
            status_code = getattr(e, "status_code", None)
            print(
                f"[REMOTE] Handshake rejected for session "
                f"{self.session_id}: HTTP {status_code}",
                flush=True,
            )
            if status_code == 403:
                self.terminal_failure = True
                self.running = False
            return False

        except Exception as e:
            text = str(e).lower()
            print(
                f"[REMOTE] WebSocket connection failed: "
                f"{type(e).__name__}: {e}",
                flush=True,
            )
            if "403" in text and "forbidden" in text:
                self.terminal_failure = True
                self.running = False
            return False

        with self._ws_lock:
            self.websocket = ws

        # A reconnect means anything in flight is lost.
        self.link.on_viewer_ready()

        self._reader_thread = threading.Thread(
            target=self._reader,
            args=(ws,),
            name=f"stream-reader-{self.session_id}",
            daemon=True,
        )
        self._reader_thread.start()

        print(
            f"[REMOTE] Screen stream connected for session {self.session_id}",
            flush=True,
        )
        return True

    # =========================================================
    # READER
    # =========================================================

    def _reader(self, ws):
        """
        Keep reading the stream socket.

        The server (uvicorn) sends WebSocket pings every ~20s and
        drops the connection if no pong comes back. websocket-client
        only answers pings while recv() is being called, and the old
        streamer never called recv(), so the stream was silently
        dropped and reconnected roughly every 40 seconds.

        If the backend ever relays acks over this socket, they are
        handled here too.
        """
        while self.running and self.websocket is ws:
            try:
                message = ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            except Exception:
                break

            if not message or not isinstance(message, str):
                continue

            try:
                data = json.loads(message)
            except ValueError:
                continue

            if data.get("type") == "frame_ack":
                try:
                    self.link.on_ack(int(data.get("seq", 0)))
                except (TypeError, ValueError):
                    pass
            elif data.get("type") == "viewer_ready":
                self.link.on_viewer_ready()

    # =========================================================
    # ADAPTIVE QUALITY
    # =========================================================

    def _adapt_quality(self):
        rtt = self.link.average_rtt()

        if rtt is None:
            return

        if rtt > 0.45 and self.quality > QUALITY_MIN:
            self.quality = max(QUALITY_MIN, self.quality - 5)
        elif rtt < 0.18 and self.quality < QUALITY_MAX:
            self.quality = min(QUALITY_MAX, self.quality + 2)

        self.capture.quality = self.quality

    # =========================================================
    # STREAM
    # =========================================================

    def stream(self):
        min_interval = 1.0 / self.max_fps
        print(
            f"[REMOTE] Streaming session {self.session_id} "
            f"(max {self.max_fps} FPS, ack-paced)",
            flush=True,
        )

        _keep_display_awake(True)
        frames_since_adapt = 0
        reconnect_delay = 0.5

        try:
            while self.running and not self.terminal_failure:

                # ---------------- connection ----------------
                if self.websocket is None:
                    if self.connect():
                        reconnect_delay = 0.5
                        continue

                    if self.terminal_failure or self._session_has_ended():
                        print(
                            f"[REMOTE] Session {self.session_id} has ended. "
                            f"Stopping streamer.",
                            flush=True,
                        )
                        break

                    time.sleep(reconnect_delay)
                    reconnect_delay = min(reconnect_delay * 2, 5.0)
                    continue

                # ---------------- flow control ----------------
                if self.link.ack_seen:
                    if not self.link.wait_for_window(
                        MAX_IN_FLIGHT,
                        timeout=ACK_STALL_TIMEOUT,
                    ):
                        # Viewer stopped acking (tab hidden, viewer
                        # reconnecting...). Resync instead of stalling.
                        self.link.forgive()
                        self.link.request_keyframe()

                # Never exceed max FPS (and be conservative if no
                # acks are arriving at all)
                interval = (
                    min_interval
                    if self.link.ack_seen
                    else 1.0 / NO_ACK_FPS
                )
                since_last = time.perf_counter() - self._last_sent_at
                if since_last < interval:
                    time.sleep(interval - since_last)
                    since_last = time.perf_counter() - self._last_sent_at

                force = (
                    self.link.consume_keyframe_request()
                    or since_last >= KEYFRAME_INTERVAL
                )

                try:
                    result = self.capture.grab(force=force)
                except Exception:
                    time.sleep(0.5)
                    continue

                if result is None:
                    time.sleep(IDLE_POLL_INTERVAL)
                    continue

                jpeg, width, height = result

                self.link.monitor = self.capture.geometry
                self.link.frame_size = (width, height)

                seq = self.link.next_seq()
                payload = FRAME_HEADER.pack(
                    FRAME_MAGIC, seq, width, height
                ) + jpeg

                ws = self.websocket
                if ws is None:
                    continue

                try:
                    ws.send_binary(payload)
                except Exception as e:
                    print(
                        f"[REMOTE] Stream send failed for session "
                        f"{self.session_id}: {type(e).__name__}: {e}",
                        flush=True,
                    )
                    self._reset_connection()
                    continue

                self.link.on_sent(seq)
                self._last_sent_at = time.perf_counter()

                frames_since_adapt += 1
                if frames_since_adapt >= 10:
                    frames_since_adapt = 0
                    self._adapt_quality()

        finally:
            _keep_display_awake(False)
            self.close()

    # =========================================================
    # RESET / CLOSE
    # =========================================================

    def _reset_connection(self):
        with self._ws_lock:
            ws = self.websocket
            self.websocket = None

        if ws is not None:
            try:
                ws.close()
            except Exception:
                pass

    def close(self):
        self.running = False
        self._reset_connection()

        try:
            self.capture.close()
        except Exception:
            pass

        drop_link(self.session_id)

        print(
            f"[REMOTE] Screen streamer closed for session {self.session_id}",
            flush=True,
        )
