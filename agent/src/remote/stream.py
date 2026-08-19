import time
import websocket

from .screen import ScreenCapture


class RemoteScreenStreamer:

    def __init__(
        self,
        server_url: str,
        session_id: int,
        fps: int = 1,
    ):
        self.server_url = server_url
        self.session_id = session_id
        self.fps = fps

        self.websocket = None
        self.capture = ScreenCapture()

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
            f"{self.session_id}/agent-stream"
        )

    def connect(self):

        url = self._build_ws_url()

        print(
            f"[REMOTE] Connecting to: {url}"
        )

        try:

            self.websocket = websocket.create_connection(
                url,
                timeout=None,
                ping_interval=20,
                ping_timeout=10,
            )

            print(
                f"[REMOTE] Screen stream connected "
                f"for session {self.session_id}"
            )

            return True

        except Exception as e:

            print(
                f"[REMOTE] WebSocket connection failed: {e}"
            )

            self.websocket = None

            return False

    def stream(self):

        frame_interval = 1 / self.fps

        while self.running:

            # -------------------------------------------------
            # Connect if there is no active WebSocket
            # -------------------------------------------------

            if self.websocket is None:

                connected = self.connect()

                if not connected:

                    print(
                        "[REMOTE] Retrying connection in 3 seconds..."
                    )

                    time.sleep(3)
                    continue

            try:

                start = time.time()

                # -------------------------------------------------
                # Capture screen
                # -------------------------------------------------

                print("[REMOTE] Capturing screen...")

                frame = self.capture.capture()

                print(
                    f"[REMOTE] Frame captured: "
                    f"{len(frame)} bytes"
                )

                # -------------------------------------------------
                # Send frame
                # -------------------------------------------------

                print("[REMOTE] Sending frame...")

                self.websocket.send_binary(frame)

                print(
                    "[REMOTE] Frame sent successfully"
                )

                # -------------------------------------------------
                # Maintain FPS
                # -------------------------------------------------

                elapsed = time.time() - start

                sleep_time = (
                    frame_interval - elapsed
                )

                if sleep_time > 0:

                    time.sleep(sleep_time)

            except websocket.WebSocketConnectionClosedException as e:

                print(
                    f"[REMOTE] WebSocket connection closed: {e}"
                )

                self._reset_connection()

                print(
                    "[REMOTE] Reconnecting in 2 seconds..."
                )

                time.sleep(2)

            except Exception as e:

                print(
                    f"[REMOTE] Screen stream error: "
                    f"{type(e).__name__}: {e}"
                )

                self._reset_connection()

                print(
                    "[REMOTE] Reconnecting in 2 seconds..."
                )

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

        try:

            self.capture.close()

        except Exception:
            pass

        print(
            "[REMOTE] Screen streamer closed"
        )