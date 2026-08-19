from typing import Dict

from fastapi import WebSocket


class RemoteControlManager:

    def __init__(self):
        self.agent_connections: Dict[int, WebSocket] = {}

    async def connect_agent(
        self,
        session_id: int,
        websocket: WebSocket
    ):
        await websocket.accept()

        self.agent_connections[session_id] = websocket

        print(
            f"[CONTROL] Agent connected for session {session_id}"
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

    async def send_command(
        self,
        session_id: int,
        command: str
    ):
        agent = self.agent_connections.get(session_id)

        if not agent:

            print(
                f"[CONTROL] No agent connected "
                f"for session {session_id}"
            )

            return False

        try:

            await agent.send_text(command)

            print(
                f"[CONTROL] Command forwarded "
                f"to agent for session {session_id}"
            )

            return True

        except Exception as e:

            print(
                f"[CONTROL] Failed to forward command: "
                f"{e}"
            )

            await self.disconnect_agent(
                session_id
            )

            return False

    def is_agent_connected(
        self,
        session_id: int
    ) -> bool:

        return session_id in self.agent_connections


remote_control_manager = RemoteControlManager()