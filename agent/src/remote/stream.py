import json
import time
import urllib.error
import urllib.request

import websocket
from websocket import WebSocketBadStatusException

from .screen import ScreenCapture


class RemoteScreenStreamer:

    def __init__(
        self,
        server_url: str,
        session_id: int,
        fps: int = 18,
    ):
        self.server_url = server_url.rstrip("/")
        self.session_id = session_id
        self.fps = max(1, fps)

        self.websocket = None

        self.capture = ScreenCapture(
            monitor=1,
            quality=55,
        )

        self.running = True

        # A terminal WebSocket failure means this session
        # must never attempt to reconnect again.
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
            f"{self.session_id}"
            f"/agent-stream"
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
                f"[REMOTE] Session "
                f"{self.session_id} status: "
                f"{status}"
            )

            return status

        except urllib.error.HTTPError as e:

            print(
                f"[REMOTE] Session "
                f"{self.session_id} status check "
                f"HTTP error: {e.code}"
            )

            # If backend no longer recognizes this session,
            # treat it as ended.
            if e.code in (403, 404):

                return "ENDED"

            return None

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
                    f"[REMOTE] TERMINAL FAILURE: "
                    f"session {self.session_id} "
                    f"was rejected with HTTP 403.",
                    flush=True,
                )

                self.terminal_failure = True
                self.running = False
                self.websocket = None

                return False

            print(
                f"[REMOTE] WebSocket connection "
                f"failed: "
                f"{type(e).__name__}: {e}"
            )

            self.websocket = None

            return False

    # =========================================================
    # SESSION ENDED?
    # =========================================================

    def _session_has_ended(self):

        status = self._get_session_status()

        return status in (
            "ENDED",
            "CLOSED",
            "CANCELLED",
            "TERMINATED",
        )

    # =========================================================
    # CONNECT
    # =========================================================

    def connect(self):

        # Never reconnect after terminal failure.
        if self.terminal_failure:

            print(
                f"[REMOTE] Connection blocked: "
                f"session {self.session_id} "
                f"has a terminal failure."
            )

            return False

        url = self._build_ws_url()

        print(
            f"[REMOTE] Connecting to: {url}"
        )

        try:

            self.websocket = (
                websocket.create_connection(
                    url,
                    timeout=None,
                    ping_interval=20,
                    ping_timeout=10,
                )
            )

            print(
                f"[REMOTE] Screen stream connected "
                f"for session "
                f"{self.session_id}"
            )

            return True

        except WebSocketBadStatusException as e:

            status_code = getattr(
                e,
                "status_code",
                None,
            )

            print(
                f"[REMOTE] WebSocket handshake "
                f"rejected for session "
                f"{self.session_id}: "
                f"HTTP {status_code}"
            )

            # -------------------------------------------------
            # 403 = backend explicitly rejected this session.
            # This session must NEVER reconnect.
            # -------------------------------------------------

            if status_code == 403:

                print(
                    f"[REMOTE] TERMINAL FAILURE: "
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
                f"[REMOTE] WebSocket connection "
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
                    f"[REMOTE] TERMINAL FAILURE: "
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
    # STREAM
    # =========================================================

    def stream(self):

        frame_interval = 1.0 / self.fps

        print(
            f"[REMOTE] Streaming session "
            f"{self.session_id} "
            f"at {self.fps} FPS"
        )

        try:

            while self.running:

                # -------------------------------------------------
                # TERMINAL FAILURE
                # -------------------------------------------------

                if self.terminal_failure:

                    print(
                        f"[REMOTE] Session "
                        f"{self.session_id} "
                        f"has a terminal failure. "
                        f"Stopping streamer."
                    )

                    break

                # -------------------------------------------------
                # CONNECT
                # -------------------------------------------------

                if self.websocket is None:

                    if not self.connect():

                        # Terminal failure.
                        if self.terminal_failure:

                            print(
                                f"[REMOTE] Session "
                                f"{self.session_id} "
                                f"terminated permanently."
                            )

                            break

                        # Session was explicitly ended.
                        if self._session_has_ended():

                            print(
                                f"[REMOTE] Session "
                                f"{self.session_id} "
                                f"has ended. "
                                f"Stopping streamer."
                            )

                            self.running = False

                            break

                        print(
                            f"[REMOTE] Temporary connection "
                            f"failure for session "
                            f"{self.session_id}. "
                            f"Retrying in 2 seconds..."
                        )

                        time.sleep(2)

                        continue

                # -------------------------------------------------
                # CAPTURE + SEND
                # -------------------------------------------------

                try:

                    start = time.perf_counter()

                    frame = self.capture.capture()

                    self.websocket.send_binary(frame)

                    elapsed = (
                        time.perf_counter()
                        - start
                    )

                    remaining = (
                        frame_interval
                        - elapsed
                    )

                    if remaining > 0:

                        time.sleep(
                            remaining
                        )

                except (
                    websocket.WebSocketConnectionClosedException,
                    websocket.WebSocketBadStatusException,
                ) as e:

                    print(
                        f"[REMOTE] Stream connection "
                        f"closed for session "
                        f"{self.session_id}: {e}"
                    )

                    self._reset_connection()

                    # Check whether the session ended.
                    if self._session_has_ended():

                        print(
                            f"[REMOTE] Session "
                            f"{self.session_id} "
                            f"has ended. "
                            f"Stopping streamer."
                        )

                        self.running = False

                        break

                    print(
                        f"[REMOTE] Reconnecting session "
                        f"{self.session_id} "
                        f"in 2 seconds..."
                    )

                    time.sleep(2)

                except Exception as e:

                    print(
                        f"[REMOTE] Screen stream error "
                        f"for session "
                        f"{self.session_id}: "
                        f"{type(e).__name__}: {e}"
                    )

                    self._reset_connection()

                    if self._session_has_ended():

                        print(
                            f"[REMOTE] Session "
                            f"{self.session_id} "
                            f"has ended. "
                            f"Stopping streamer."
                        )

                        self.running = False

                        break

                    print(
                        f"[REMOTE] Reconnecting session "
                        f"{self.session_id} "
                        f"in 2 seconds..."
                    )

                    time.sleep(2)

        finally:

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

        try:

            self.capture.close()

        except Exception:

            pass

        print(
            f"[REMOTE] Screen streamer closed "
            f"for session "
            f"{self.session_id}"
        )