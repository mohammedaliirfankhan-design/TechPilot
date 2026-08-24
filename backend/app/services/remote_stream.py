import asyncio
from typing import Dict, Optional

from fastapi import WebSocket


class RemoteStreamManager:

    def __init__(self):

        # =========================================================
        # SCREEN CONNECTIONS
        # =========================================================

        self.agent_connections: Dict[
            int,
            WebSocket
        ] = {}

        self.viewer_connections: Dict[
            int,
            WebSocket
        ] = {}

        # =========================================================
        # LATEST FRAME
        #
        # IMPORTANT:
        #
        # We NEVER build a queue of old screen frames.
        #
        # Remote desktop streaming must always prefer:
        #
        # CURRENT FRAME
        #
        # over:
        #
        # OLD FRAME -> OLD FRAME -> OLD FRAME
        # =========================================================

        self.latest_frames: Dict[
            int,
            bytes
        ] = {}

        self.frame_events: Dict[
            int,
            asyncio.Event
        ] = {}

        # =========================================================
        # REMOTE CONTROL
        # =========================================================

        self.agent_control_connections: Dict[
            int,
            WebSocket
        ] = {}

        self.viewer_control_connections: Dict[
            int,
            WebSocket
        ] = {}

    # =========================================================
    # SCREEN STREAM
    # =========================================================

    async def connect_agent(
        self,
        session_id: int,
        websocket: WebSocket,
    ):

        await websocket.accept()

        old_socket = (
            self.agent_connections.get(
                session_id
            )
        )

        if old_socket and old_socket is not websocket:

            try:
                await old_socket.close()

            except Exception:
                pass

        self.agent_connections[
            session_id
        ] = websocket

        self.frame_events[
            session_id
        ] = asyncio.Event()

        self.latest_frames.pop(
            session_id,
            None
        )

        print(
            f"[STREAM] Agent connected "
            f"for session {session_id}"
        )

    async def connect_viewer(
        self,
        session_id: int,
        websocket: WebSocket,
    ):

        await websocket.accept()

        old_socket = (
            self.viewer_connections.get(
                session_id
            )
        )

        if old_socket and old_socket is not websocket:

            try:
                await old_socket.close()

            except Exception:
                pass

        self.viewer_connections[
            session_id
        ] = websocket

        if (
            session_id
            not in self.frame_events
        ):

            self.frame_events[
                session_id
            ] = asyncio.Event()

        print(
            f"[STREAM] Viewer connected "
            f"for session {session_id}"
        )

    # =========================================================
    # AGENT DISCONNECT
    # =========================================================

    async def disconnect_agent(
        self,
        session_id: int,
    ):

        websocket = (
            self.agent_connections.pop(
                session_id,
                None
            )
        )

        if websocket:

            try:
                await websocket.close()

            except Exception:
                pass

        self.latest_frames.pop(
            session_id,
            None
        )

        event = (
            self.frame_events.get(
                session_id
            )
        )

        if event:

            event.set()

        print(
            f"[STREAM] Agent disconnected "
            f"for session {session_id}"
        )

    # =========================================================
    # VIEWER DISCONNECT
    # =========================================================

    async def disconnect_viewer(
        self,
        session_id: int,
    ):

        websocket = (
            self.viewer_connections.pop(
                session_id,
                None
            )
        )

        if websocket:

            try:
                await websocket.close()

            except Exception:
                pass

        print(
            f"[STREAM] Viewer disconnected "
            f"for session {session_id}"
        )

    # =========================================================
    # RECEIVE FRAME FROM AGENT
    # =========================================================

    async def send_frame(
        self,
        session_id: int,
        frame: bytes,
    ):

        if not frame:

            return

        # ---------------------------------------------------------
        # ALWAYS KEEP ONLY THE NEWEST FRAME
        # ---------------------------------------------------------

        self.latest_frames[
            session_id
        ] = frame

        event = (
            self.frame_events.get(
                session_id
            )
        )

        if event:

            event.set()

    # =========================================================
    # STREAM FRAMES TO VIEWER
    # =========================================================

    async def stream_to_viewer(
        self,
        session_id: int,
        websocket: WebSocket,
    ):

        if (
            session_id
            not in self.frame_events
        ):

            self.frame_events[
                session_id
            ] = asyncio.Event()

        event = self.frame_events[
            session_id
        ]

        print(
            f"[STREAM] Viewer frame loop "
            f"started for session "
            f"{session_id}"
        )

        try:

            while True:

                # -------------------------------------------------
                # WAIT FOR NEW FRAME
                # -------------------------------------------------

                await event.wait()

                # -------------------------------------------------
                # GET NEWEST FRAME
                # -------------------------------------------------

                frame = (
                    self.latest_frames.get(
                        session_id
                    )
                )

                # -------------------------------------------------
                # SESSION MAY HAVE CLOSED
                # -------------------------------------------------

                if websocket.client_state.name != "CONNECTED":

                    break

                if frame is None:

                    event.clear()

                    continue

                # -------------------------------------------------
                # CLEAR EVENT BEFORE SEND
                #
                # If a newer frame arrives while send_bytes()
                # is executing, send_frame() will set the event
                # again.
                # -------------------------------------------------

                event.clear()

                try:

                    await websocket.send_bytes(
                        frame
                    )

                except Exception as e:

                    print(
                        f"[STREAM] Failed to send "
                        f"frame to viewer "
                        f"for session "
                        f"{session_id}: "
                        f"{type(e).__name__}: {e}"
                    )

                    break

        except asyncio.CancelledError:

            print(
                f"[STREAM] Viewer frame loop "
                f"cancelled for session "
                f"{session_id}"
            )

            raise

        except Exception as e:

            print(
                f"[STREAM] Viewer frame loop "
                f"error for session "
                f"{session_id}: "
                f"{type(e).__name__}: {e}"
            )

        finally:

            print(
                f"[STREAM] Viewer frame loop "
                f"stopped for session "
                f"{session_id}"
            )

    # =========================================================
    # CONTROL CONNECTIONS
    # =========================================================

    async def connect_agent_control(
        self,
        session_id: int,
        websocket: WebSocket,
    ):

        await websocket.accept()

        old_socket = (
            self.agent_control_connections.get(
                session_id
            )
        )

        if old_socket and old_socket is not websocket:

            try:
                await old_socket.close()

            except Exception:
                pass

        self.agent_control_connections[
            session_id
        ] = websocket

        print(
            f"[CONTROL] Agent control connected "
            f"for session {session_id}"
        )

    async def connect_viewer_control(
        self,
        session_id: int,
        websocket: WebSocket,
    ):

        await websocket.accept()

        old_socket = (
            self.viewer_control_connections.get(
                session_id
            )
        )

        if old_socket and old_socket is not websocket:

            try:
                await old_socket.close()

            except Exception:
                pass

        self.viewer_control_connections[
            session_id
        ] = websocket

        print(
            f"[CONTROL] Viewer control connected "
            f"for session {session_id}"
        )

    # =========================================================
    # CONTROL DISCONNECTS
    # =========================================================

    async def disconnect_agent_control(
        self,
        session_id: int,
    ):

        websocket = (
            self.agent_control_connections.pop(
                session_id,
                None
            )
        )

        if websocket:

            try:
                await websocket.close()

            except Exception:
                pass

        print(
            f"[CONTROL] Agent control disconnected "
            f"for session {session_id}"
        )

    async def disconnect_viewer_control(
        self,
        session_id: int,
    ):

        websocket = (
            self.viewer_control_connections.pop(
                session_id,
                None
            )
        )

        if websocket:

            try:
                await websocket.close()

            except Exception:
                pass

        print(
            f"[CONTROL] Viewer control disconnected "
            f"for session {session_id}"
        )

    # =========================================================
    # SEND CONTROL COMMAND
    # =========================================================

    async def send_control_command(
        self,
        session_id: int,
        command: str,
    ):

        agent = (
            self.agent_control_connections.get(
                session_id
            )
        )

        if not agent:

            print(
                f"[CONTROL] No agent control "
                f"connection for session "
                f"{session_id}"
            )

            return False

        try:

            await agent.send_text(
                command
            )

            return True

        except Exception as e:

            print(
                f"[CONTROL] Command error: "
                f"{type(e).__name__}: {e}"
            )

            await self.disconnect_agent_control(
                session_id
            )

            return False

    # =========================================================
    # STATUS
    # =========================================================

    def is_agent_connected(
        self,
        session_id: int,
    ) -> bool:

        return (
            session_id
            in self.agent_connections
        )

    def is_viewer_connected(
        self,
        session_id: int,
    ) -> bool:

        return (
            session_id
            in self.viewer_connections
        )

    def is_agent_control_connected(
        self,
        session_id: int,
    ) -> bool:

        return (
            session_id
            in self.agent_control_connections
        )

    def is_viewer_control_connected(
        self,
        session_id: int,
    ) -> bool:

        return (
            session_id
            in self.viewer_control_connections
        )

    # =========================================================
    # CLEAN SESSION
    # =========================================================

    async def cleanup_session(
        self,
        session_id: int,
    ):

        await self.disconnect_agent(
            session_id
        )

        await self.disconnect_viewer(
            session_id
        )

        await self.disconnect_agent_control(
            session_id
        )

        await self.disconnect_viewer_control(
            session_id
        )

        self.latest_frames.pop(
            session_id,
            None
        )

        self.frame_events.pop(
            session_id,
            None
        )

        print(
            f"[STREAM] Session "
            f"{session_id} fully cleaned up"
        )


remote_stream_manager = (
    RemoteStreamManager()
)