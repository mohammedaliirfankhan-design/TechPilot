import json
import time
import websocket
import pyautogui


pyautogui.FAILSAFE = True


class RemoteControlClient:

    def __init__(
        self,
        server_url: str,
        session_id: int,
    ):
        self.server_url = server_url
        self.session_id = session_id

        self.websocket = None
        self.running = True

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

    def connect(self):

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
                f"[CONTROL] Control channel connected "
                f"for session {self.session_id}"
            )

            return True

        except Exception as e:

            print(
                f"[CONTROL] WebSocket connection failed: {e}"
            )

            self.websocket = None

            return False

    # ---------------------------------------------------------
    # Execute remote command
    # ---------------------------------------------------------

    def execute_command(self, command: dict):

        command_type = command.get("type")

        # -----------------------------------------------------
        # Mouse movement
        # -----------------------------------------------------

        if command_type == "mouse_move":

            x = int(command["x"])
            y = int(command["y"])

            # IMPORTANT:
            # Remote cursor movement must be immediate.
            pyautogui.moveTo(
                x,
                y,
                duration=0
            )

            return

        # -----------------------------------------------------
        # Mouse click
        # -----------------------------------------------------

        elif command_type == "mouse_click":

            x = int(command["x"])
            y = int(command["y"])

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

        # -----------------------------------------------------
        # Mouse down
        # -----------------------------------------------------

        elif command_type == "mouse_down":

            button = command.get(
                "button",
                "left"
            )

            pyautogui.mouseDown(
                button=button
            )

            print(
                f"[CONTROL] Mouse down: {button}"
            )

        # -----------------------------------------------------
        # Mouse up
        # -----------------------------------------------------

        elif command_type == "mouse_up":

            button = command.get(
                "button",
                "left"
            )

            pyautogui.mouseUp(
                button=button
            )

            print(
                f"[CONTROL] Mouse up: {button}"
            )

        # -----------------------------------------------------
        # Keyboard key
        # -----------------------------------------------------

        elif command_type == "key_press":

            key = command["key"]

            pyautogui.press(key)

            print(
                f"[CONTROL] Key press: {key}"
            )

        # -----------------------------------------------------
        # Keyboard combination
        # -----------------------------------------------------

        elif command_type == "hotkey":

            keys = command["keys"]

            pyautogui.hotkey(*keys)

            print(
                f"[CONTROL] Hotkey: {keys}"
            )

        # -----------------------------------------------------
        # Type text
        # -----------------------------------------------------

        elif command_type == "type_text":

            text = command["text"]

            pyautogui.write(
                text,
                interval=0.02
            )

            print(
                "[CONTROL] Text typed"
            )

        # -----------------------------------------------------
        # Scroll
        # -----------------------------------------------------

        elif command_type == "scroll":

            amount = int(
                command.get(
                    "amount",
                    1
                )
            )

            pyautogui.scroll(amount)

            print(
                f"[CONTROL] Scroll: {amount}"
            )

        else:

            print(
                f"[CONTROL] Unknown command: "
                f"{command_type}"
            )

    # ---------------------------------------------------------
    # Listen for commands
    # ---------------------------------------------------------

    def listen(self):

        while self.running:

            if self.websocket is None:

                connected = self.connect()

                if not connected:

                    print(
                        "[CONTROL] Retrying connection "
                        "in 3 seconds..."
                    )

                    time.sleep(3)
                    continue

            try:

                message = self.websocket.recv()

                if message is None:
                    continue

                try:

                    command = json.loads(message)

                    self.execute_command(
                        command
                    )

                except json.JSONDecodeError:

                    print(
                        "[CONTROL] Received invalid JSON"
                    )

                except Exception as e:

                    print(
                        f"[CONTROL] Command execution "
                        f"failed: {type(e).__name__}: {e}"
                    )

            except websocket.WebSocketConnectionClosedException:

                print(
                    "[CONTROL] Control WebSocket closed"
                )

                self._reset_connection()

                time.sleep(2)

            except Exception as e:

                print(
                    f"[CONTROL] Control channel error: "
                    f"{type(e).__name__}: {e}"
                )

                self._reset_connection()

                time.sleep(2)

        self.close()

    def _reset_connection(self):

        if self.websocket:

            try:
                self.websocket.close()

            except Exception:
                pass

        self.websocket = None

    def close(self):

        self.running = False

        self._reset_connection()

        print(
            "[CONTROL] Control client closed"
        )