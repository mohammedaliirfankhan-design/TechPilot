from typing import Dict

from fastapi import WebSocket


class RemoteStreamManager:
    def __init__(self):
        self.agent_connections: Dict[int, WebSocket] = {}
        self.viewer_connections: Dict[int, WebSocket] = {}

    async def connect_agent(
        self,
        session_id: int,
        websocket: WebSocket
    ):
        await websocket.accept()
        self.agent_connections[session_id] = websocket

    async def connect_viewer(
        self,
        session_id: int,
        websocket: WebSocket
    ):
        await websocket.accept()
        self.viewer_connections[session_id] = websocket

    async def disconnect_agent(self, session_id: int):
        websocket = self.agent_connections.pop(session_id, None)

        if websocket:
            try:
                await websocket.close()
            except Exception:
                pass

    async def disconnect_viewer(self, session_id: int):
        websocket = self.viewer_connections.pop(session_id, None)

        if websocket:
            try:
                await websocket.close()
            except Exception:
                pass

    async def send_frame(
        self,
        session_id: int,
        frame: bytes
    ):
        viewer = self.viewer_connections.get(session_id)

        if not viewer:
            return

        try:
            await viewer.send_bytes(frame)

        except Exception:
            await self.disconnect_viewer(session_id)

    def is_agent_connected(self, session_id: int) -> bool:
        return session_id in self.agent_connections

    def is_viewer_connected(self, session_id: int) -> bool:
        return session_id in self.viewer_connections


remote_stream_manager = RemoteStreamManager()