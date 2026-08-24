import ctypes
import json
import time
import urllib.request

import websocket
import pyautogui


pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0


# =============================================================
# WINDOWS MOUSE CONSTANTS
# =============================================================

MOUSEEVENTF_WHEEL = 0x0800
WHEEL_DELTA = 120


class RemoteControlClient:

    def __init__(
        self,
        server_url: str,
        session_id: int,
    ):
        print(
    f"[CONTROL] LOADED CONTROL MODULE FROM: {__file__}",
    flush=True
)
        self.server_url = server_url
        self.session_id = session_id

        self.websocket = None
        self.running = True

        # -----------------------------------------------------
        # IMPORTANT:
        # A terminal connection failure means this session
        # must NOT enter another reconnect loop.
        # -----------------------------------------------------

        self.terminal_failure = False

    # =========================================================
    # BUILD WEBSOCKET URL
    # =========================================================

    def _build_ws_url(self):

        ws_url = (
            self.server_url
            .replace("http://", "ws://")
            .replace("https://", "wss://")
        )

        return (
            f"{ws_url}"
            f"/api/v1/remote/sessions/"
            f"{self.session_id}/agent-control"
        )

    # =========================================================
    # BUILD SESSION URL
    # =========================================================

    def _build_session_url(self):

        return (
            f"{self.server_url}"
            f"/api/v1/remote/sessions/"
            f"{self.session_id}"
        )

    # =========================================================
    # GET SESSION STATUS
    # =========================================================

    def _get_session_status(self):

        url = self._build_session_url()

        try:

            request = urllib.request.Request(
                url,
                method="GET",
            )

            with urllib.request.urlopen(
                request,
                timeout=5,
            ) as response:

                data = json.loads(
                    response.read().decode("utf-8")
                )

            status = data.get("status")

            print(
                f"[CONTROL] Session "
                f"{self.session_id} status: "
                f"{status}"
            )

            return status

        except Exception as e:

            status_code = getattr(
                e,
                "status_code",
                None,
            )

            error_text = str(e).lower()

            # Some websocket-client versions do not raise
            # WebSocketBadStatusException consistently for
            # a rejected 403 handshake. Detect it here too.
            is_403 = (
                status_code == 403
                or "403 forbidden" in error_text
                or "handshake status 403" in error_text
            )

            if is_403:

                print(
                    f"[CONTROL] TERMINAL FAILURE: "
                    f"session {self.session_id} "
                    f"was rejected with HTTP 403.",
                    flush=True,
                )

                self.terminal_failure = True
                self.running = False
                self.websocket = None

                return False

            print(
                f"[CONTROL] WebSocket connection "
                f"failed: "
                f"{type(e).__name__}: {e}"
            )

            self.websocket = None

            return False

    # =========================================================
    # SESSION ENDED
    # =========================================================

    def _session_has_ended(self):

        status = self._get_session_status()

        return status == "ENDED"

    # =========================================================
    # CONNECT
    # =========================================================

    def connect(self):

        if self.terminal_failure:

            print(
                f"[CONTROL] Connection blocked: "
                f"session {self.session_id} "
                f"has a terminal failure."
            )

            return False

        url = self._build_ws_url()

        print(
            f"[CONTROL] Connecting to: {url}"
        )

        try:

            self.websocket = websocket.create_connection(
                url,
                timeout=None,
                ping_interval=20,
                ping_timeout=10,
            )

            print(
                f"[CONTROL] Control channel "
                f"connected for session "
                f"{self.session_id}"
            )

            return True

        except websocket.WebSocketBadStatusException as e:

            status_code = getattr(
                e,
                "status_code",
                None,
            )

            print(
                f"[CONTROL] WebSocket handshake "
                f"rejected for session "
                f"{self.session_id}: "
                f"HTTP {status_code}"
            )

            # -------------------------------------------------
            # 403 means the backend explicitly rejected this
            # session. NEVER reconnect this same socket.
            # -------------------------------------------------

            if status_code == 403:

                print(
                    f"[CONTROL] TERMINAL FAILURE: "
                    f"session {self.session_id} "
                    f"was rejected with 403."
                )

                self.terminal_failure = True
                self.running = False

                self.websocket = None

                return False

            self.websocket = None

            return False

        except Exception as e:

            error_text = str(e).lower()

            print(
                f"[CONTROL] WebSocket connection "
                f"failed: "
                f"{type(e).__name__}: {e}",
                flush=True,
            )

            # -------------------------------------------------
            # Treat HTTP 403 as a terminal session failure.
            # Some websocket-client versions route 403
            # handshake errors through generic Exception.
            # -------------------------------------------------

            if (
                "403 forbidden" in error_text
                or "handshake status 403" in error_text
                or "status 403" in error_text
            ):

                print(
                    f"[CONTROL] TERMINAL FAILURE: "
                    f"session {self.session_id} "
                    f"was rejected with HTTP 403.",
                    flush=True,
                )

                self.terminal_failure = True
                self.running = False
                self.websocket = None

                return False

            self.websocket = None

            return False

    # =========================================================
    # REMOTE SCROLL - DIAGNOSTIC VERSION
    # =========================================================

    def _native_scroll(self, amount: int):

        print(
            f"[CONTROL] >>> ENTERED _native_scroll() amount={amount}",
            flush=True
        )

        try:

            amount = int(amount)

            if amount == 0:
                print(
                    "[CONTROL] >>> Scroll amount is zero",
                    flush=True
                )
                return

            print(
                f"[CONTROL] >>> About to execute Windows scroll "
                f"amount={amount}",
                flush=True
            )

            SCROLL_MULTIPLIER = 10

            wheel_amount = (
                amount
                * 120
                * SCROLL_MULTIPLIER
            )

            print(
                f"[CONTROL] >>> wheel_amount={wheel_amount}",
                flush=True
            )

            ctypes.windll.user32.mouse_event(
                MOUSEEVENTF_WHEEL,
                0,
                0,
                wheel_amount,
                0,
            )

            print(
                "[CONTROL] >>> Windows mouse_event() completed",
                flush=True
            )

        except Exception as e:

            print(
                f"[CONTROL] >>> NATIVE SCROLL ERROR: "
                f"{type(e).__name__}: {e}",
                flush=True
            )

    # =========================================================
    # EXECUTE COMMAND
    # =========================================================

    def execute_command(
        self,
        command: dict
    ):

        command_type = command.get(
            "type"
        )

        if command_type == "mouse_move":

            x = int(
                command["x"]
            )

            y = int(
                command["y"]
            )

            pyautogui.moveTo(
                x,
                y,
                duration=0
            )

            print(
                f"[CONTROL] Mouse move: "
                f"({x}, {y})"
            )

            return

        elif command_type == "mouse_click":

            x = int(
                command["x"]
            )

            y = int(
                command["y"]
            )

            button = command.get(
                "button",
                "left"
            )

            clicks = int(
                command.get(
                    "clicks",
                    1
                )
            )

            pyautogui.click(
                x=x,
                y=y,
                clicks=clicks,
                button=button
            )

            print(
                f"[CONTROL] Mouse click: "
                f"{button} at ({x}, {y})"
            )

        elif command_type == "mouse_down":

            button = command.get(
                "button",
                "left"
            )

            pyautogui.mouseDown(
                button=button
            )

            print(
                f"[CONTROL] Mouse down: "
                f"{button}"
            )

        elif command_type == "mouse_up":

            button = command.get(
                "button",
                "left"
            )

            pyautogui.mouseUp(
                button=button
            )

            print(
                f"[CONTROL] Mouse up: "
                f"{button}"
            )

        elif command_type == "key_press":

            key = command["key"]

            pyautogui.press(
                key
            )

            print(
                f"[CONTROL] Key press: "
                f"{key}"
            )

        elif command_type == "hotkey":

            keys = command["keys"]

            pyautogui.hotkey(
                *keys
            )

            print(
                f"[CONTROL] Hotkey: "
                f"{keys}"
            )

        elif command_type == "type_text":

            text = command["text"]

            pyautogui.write(
                text,
                interval=0.02
            )

            print(
                "[CONTROL] Text typed"
            )

        elif command_type == "scroll":

            amount = int(
                command.get(
                    "amount",
                    1
                )
            )

            if amount == 0:

                return

            print(
                f"[CONTROL] Scroll command received: "
                f"amount={amount}",
                flush=True
            )

            self._native_scroll(
                amount
            )

        else:

            print(
                f"[CONTROL] Unknown command: "
                f"{command_type}"
            )

    # =========================================================
    # LISTEN
    # =========================================================

    def listen(self):

        while self.running:

            # -------------------------------------------------
            # DO NOT CONNECT AFTER TERMINAL FAILURE
            # -------------------------------------------------

            if self.terminal_failure:

                break

            # -------------------------------------------------
            # CONNECT
            # -------------------------------------------------

            if self.websocket is None:

                connected = self.connect()

                if not connected:

                    # 403 / terminal failure
                    if self.terminal_failure:

                        print(
                            f"[CONTROL] Session "
                            f"{self.session_id} "
                            f"control stopped permanently."
                        )

                        break

                    # Session was explicitly ended
                    if self._session_has_ended():

                        print(
                            f"[CONTROL] Session "
                            f"{self.session_id} "
                            f"has ended. "
                            f"Stopping control client."
                        )

                        self.running = False

                        break

                    print(
                        "[CONTROL] Retrying connection "
                        "in 2 seconds..."
                    )

                    time.sleep(2)

                    continue

            try:

                message = self.websocket.recv()

                if message is None:

                    continue

                print(
                    f"[CONTROL] Message received: "
                    f"{message}"
                )

                try:

                    command = json.loads(
                        message
                    )

                    print(
                        f"[CONTROL] Parsed command: "
                        f"{command}"
                    )

                    print(
                        f"[CONTROL] Executing command: "
                        f"{command.get('type')}"
                    )

                    self.execute_command(
                        command
                    )

                except json.JSONDecodeError:

                    print(
                        "[CONTROL] Received "
                        "invalid JSON"
                    )

                except Exception as e:

                    print(
                        f"[CONTROL] Command execution "
                        f"failed: "
                        f"{type(e).__name__}: {e}"
                    )

            except websocket.WebSocketConnectionClosedException:

                print(
                    "[CONTROL] Control WebSocket closed"
                )

                self._reset_connection()

                if self._session_has_ended():

                    print(
                        f"[CONTROL] Session "
                        f"{self.session_id} "
                        f"has ended. "
                        f"Stopping control client."
                    )

                    self.running = False

                    break

                print(
                    "[CONTROL] Reconnecting "
                    "in 2 seconds..."
                )

                time.sleep(2)

            except Exception as e:

                print(
                    f"[CONTROL] Control channel error: "
                    f"{type(e).__name__}: {e}"
                )

                self._reset_connection()

                if self._session_has_ended():

                    print(
                        f"[CONTROL] Session "
                        f"{self.session_id} "
                        f"has ended. "
                        f"Stopping control client."
                    )

                    self.running = False

                    break

                print(
                    "[CONTROL] Reconnecting "
                    "in 2 seconds..."
                )

                time.sleep(2)

        self.close()

    # =========================================================
    # RESET CONNECTION
    # =========================================================

    def _reset_connection(self):

        if self.websocket:

            try:

                self.websocket.close()

            except Exception:

                pass

        self.websocket = None

    # =========================================================
    # CLOSE
    # =========================================================

    def close(self):

        self.running = False

        self._reset_connection()

        print(
            "[CONTROL] Control client closed"
        )