from typing import Dict

from fastapi import WebSocket


class RemoteStreamManager:

    def __init__(self):

        # =====================================================
        # SCREEN STREAM
        # =====================================================

        self.agent_connections: Dict[int, WebSocket] = {}
        self.viewer_connections: Dict[int, WebSocket] = {}

        # =====================================================
        # REMOTE CONTROL
        # =====================================================

        self.agent_control_connections: Dict[int, WebSocket] = {}
        self.viewer_control_connections: Dict[int, WebSocket] = {}

    # =========================================================
    # SCREEN STREAM
    # =========================================================

    async def connect_agent(
        self,
        session_id: int,
        websocket: WebSocket
    ):
        await websocket.accept()

        self.agent_connections[session_id] = websocket

        print(
            f"[STREAM] Agent connected for session {session_id}"
        )

    async def connect_viewer(
        self,
        session_id: int,
        websocket: WebSocket
    ):
        await websocket.accept()

        self.viewer_connections[session_id] = websocket

        print(
            f"[STREAM] Viewer connected for session {session_id}"
        )

    async def disconnect_agent(
        self,
        session_id: int
    ):
        websocket = self.agent_connections.pop(
            session_id,
            None
        )

        if websocket:

            try:
                await websocket.close()

            except Exception:
                pass

        print(
            f"[STREAM] Agent disconnected for session {session_id}"
        )

    async def disconnect_viewer(
        self,
        session_id: int
    ):
        websocket = self.viewer_connections.pop(
            session_id,
            None
        )

        if websocket:

            try:
                await websocket.close()

            except Exception:
                pass

        print(
            f"[STREAM] Viewer disconnected for session {session_id}"
        )

    async def send_frame(
        self,
        session_id: int,
        frame: bytes
    ):

        viewer = self.viewer_connections.get(
            session_id
        )

        if not viewer:

            print(
                f"[STREAM] No viewer connected "
                f"for session {session_id}"
            )

            return

        try:

            print(
                f"[STREAM] Relaying frame: "
                f"{len(frame)} bytes "
                f"to session {session_id}"
            )

            await viewer.send_bytes(frame)

            print(
                f"[STREAM] Frame relayed successfully: "
                f"{len(frame)} bytes"
            )

        except Exception as e:

            print(
                f"[STREAM] Frame relay error: "
                f"{type(e).__name__}: {e}"
            )

            await self.disconnect_viewer(
                session_id
            )

    # =========================================================
    # REMOTE CONTROL
    # =========================================================

    async def connect_agent_control(
        self,
        session_id: int,
        websocket: WebSocket
    ):

        await websocket.accept()

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
        websocket: WebSocket
    ):

        await websocket.accept()

        self.viewer_control_connections[
            session_id
        ] = websocket

        print(
            f"[CONTROL] Viewer control connected "
            f"for session {session_id}"
        )

    async def disconnect_agent_control(
        self,
        session_id: int
    ):

        websocket = self.agent_control_connections.pop(
            session_id,
            None
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
        session_id: int
    ):

        websocket = self.viewer_control_connections.pop(
            session_id,
            None
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

    async def send_control_command(
        self,
        session_id: int,
        command: str
    ):

        agent = self.agent_control_connections.get(
            session_id
        )

        if not agent:

            print(
                f"[CONTROL] No agent control connection "
                f"for session {session_id}"
            )

            return False

        try:

            await agent.send_text(command)

            print(
                f"[CONTROL] Command sent "
                f"to session {session_id}: {command}"
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
        session_id: int
    ) -> bool:

        return session_id in self.agent_connections

    def is_viewer_connected(
        self,
        session_id: int
    ) -> bool:

        return session_id in self.viewer_connections

    def is_agent_control_connected(
        self,
        session_id: int
    ) -> bool:

        return session_id in self.agent_control_connections

    def is_viewer_control_connected(
        self,
        session_id: int
    ) -> bool:

        return session_id in self.viewer_control_connections


remote_stream_manager = RemoteStreamManager()