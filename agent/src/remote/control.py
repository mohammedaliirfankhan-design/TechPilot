import json
import socket
import time
import urllib.error
import urllib.request
from urllib.parse import quote

import websocket

from techpilot_agent.config import AGENT_TOKEN

from . import input_win
from .flow import get_link


ENDED_STATUSES = ("ENDED", "CLOSED", "CANCELLED", "TERMINATED")

# Set to True only while debugging. Printing every mouse move to a
# Windows console is slow and was adding visible input delay.
VERBOSE = False


class RemoteControlClient:

    def __init__(
        self,
        server_url: str,
        session_id: int,
        **_ignored,
    ):
        self.server_url = server_url.rstrip("/")
        self.session_id = session_id

        self.websocket = None
        self.running = True
        self.terminal_failure = False

        self.link = get_link(session_id)

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
            f"{self.session_id}/agent-control?token={token}"
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

        except Exception:
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
        print(f"[CONTROL] Connecting to: {url.split('?')[0]}", flush=True)

        try:
            self.websocket = websocket.create_connection(
                url,
                # recv() wakes up once a second so we notice shutdown;
                # it also lets websocket-client answer server pings.
                timeout=1,
                sockopt=((socket.IPPROTO_TCP, socket.TCP_NODELAY, 1),),
            )

        except websocket.WebSocketBadStatusException as e:
            status_code = getattr(e, "status_code", None)
            print(
                f"[CONTROL] Handshake rejected for session "
                f"{self.session_id}: HTTP {status_code}",
                flush=True,
            )
            if status_code == 403:
                self.terminal_failure = True
                self.running = False
            self.websocket = None
            return False

        except Exception as e:
            text = str(e).lower()
            print(
                f"[CONTROL] WebSocket connection failed: "
                f"{type(e).__name__}: {e}",
                flush=True,
            )
            if "403" in text and "forbidden" in text:
                self.terminal_failure = True
                self.running = False
            self.websocket = None
            return False

        print(
            f"[CONTROL] Control channel connected for session {self.session_id}",
            flush=True,
        )
        return True

    # =========================================================
    # COORDINATES
    # =========================================================

    def _screen_point(self, command):
        """
        Map viewer coordinates to absolute physical screen pixels.

        Preferred: normalised nx/ny (0..1) relative to the streamed
        monitor. Fallback: x/y in streamed-frame pixels.
        """
        monitor = self.link.monitor

        if monitor is None:
            if "x" in command and "y" in command:
                return int(command["x"]), int(command["y"])
            return None

        if "nx" in command and "ny" in command:
            nx = min(max(float(command["nx"]), 0.0), 1.0)
            ny = min(max(float(command["ny"]), 0.0), 1.0)
        elif "x" in command and "y" in command:
            frame_w, frame_h = self.link.frame_size or (
                monitor["width"],
                monitor["height"],
            )
            nx = float(command["x"]) / max(1, frame_w - 1)
            ny = float(command["y"]) / max(1, frame_h - 1)
        else:
            return None

        x = monitor["left"] + round(nx * (monitor["width"] - 1))
        y = monitor["top"] + round(ny * (monitor["height"] - 1))
        return x, y

    # =========================================================
    # EXECUTE COMMAND
    # =========================================================

    def execute_command(self, command: dict):
        kind = command.get("type")

        # ---- flow control messages from the viewer ----
        if kind == "frame_ack":
            self.link.on_ack(int(command.get("seq", 0)))
            return

        if kind == "viewer_ready":
            self.link.on_viewer_ready()
            return

        if VERBOSE:
            print(f"[CONTROL] {command}", flush=True)

        # ---- mouse ----
        if kind == "mouse_move":
            point = self._screen_point(command)
            if point:
                input_win.mouse_move(*point)
            return

        if kind in ("mouse_down", "mouse_up"):
            point = self._screen_point(command)
            x, y = point if point else (None, None)
            input_win.mouse_button(
                command.get("button", "left"),
                down=(kind == "mouse_down"),
                x=x,
                y=y,
            )
            return

        if kind == "mouse_click":
            point = self._screen_point(command)
            x, y = point if point else (None, None)
            input_win.mouse_click(
                command.get("button", "left"),
                x=x,
                y=y,
                clicks=int(command.get("clicks", 1)),
            )
            return

        if kind == "scroll":
            if "delta" in command:
                delta = int(command["delta"])
            else:
                # legacy: amount in notches
                delta = int(command.get("amount", 0)) * 120

            delta = max(-2400, min(2400, delta))
            input_win.scroll(delta)

            hdelta = int(command.get("hdelta", 0) or 0)
            if hdelta:
                input_win.scroll(max(-2400, min(2400, hdelta)), horizontal=True)
            return

        # ---- keyboard ----
        if kind == "type_text":
            input_win.type_text(command.get("text", ""))
            return

        if kind == "key_press":
            input_win.key_press(command["key"])
            return

        if kind == "hotkey":
            input_win.hotkey(command["keys"])
            return

        print(f"[CONTROL] Unknown command: {kind}", flush=True)

    # =========================================================
    # LISTEN
    # =========================================================

    def listen(self):
        reconnect_delay = 0.5

        while self.running and not self.terminal_failure:

            if self.websocket is None:
                if self.connect():
                    reconnect_delay = 0.5
                    continue

                if self.terminal_failure or self._session_has_ended():
                    print(
                        f"[CONTROL] Session {self.session_id} has ended. "
                        f"Stopping control client.",
                        flush=True,
                    )
                    break

                time.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, 5.0)
                continue

            try:
                message = self.websocket.recv()

            except websocket.WebSocketTimeoutException:
                continue

            except Exception as e:
                print(
                    f"[CONTROL] Control channel closed: "
                    f"{type(e).__name__}: {e}",
                    flush=True,
                )
                self._reset_connection()
                continue

            if not message:
                continue

            try:
                command = json.loads(message)
            except (ValueError, TypeError):
                continue

            if not isinstance(command, dict):
                continue

            try:
                self.execute_command(command)
            except Exception as e:
                # A single bad command must never kill the channel.
                print(
                    f"[CONTROL] Command {command.get('type')} failed: "
                    f"{type(e).__name__}: {e}",
                    flush=True,
                )

        self.close()

    # =========================================================
    # RESET / CLOSE
    # =========================================================

    def _reset_connection(self):
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
        print("[CONTROL] Control client closed", flush=True)
