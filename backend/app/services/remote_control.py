from typing import Dict

from fastapi import WebSocket


class RemoteControlManager:
    """
    Relays viewer control messages (mouse, keyboard, frame acks)
    to the agent's control socket.

    This path carries dozens of messages per second during a
    session, so it must not log per message. Only failures are
    logged.
    """

    def __init__(self):
        self.agent_connections: Dict[int, WebSocket] = {}

    async def connect_agent(
        self,
        session_id: int,
        websocket: WebSocket,
    ):
        await websocket.accept()

        self.agent_connections[session_id] = websocket

        print(
            f"[CONTROL] Agent connected for session {session_id}",
            flush=True,
        )

    async def disconnect_agent(
        self,
        session_id: int,
        websocket: WebSocket | None = None,
    ):
        current_websocket = self.agent_connections.get(session_id)

        if current_websocket is None:
            return

        # If a specific socket was supplied, only disconnect it
        # when it is still the currently registered socket.
        if websocket is not None and current_websocket is not websocket:
            return

        self.agent_connections.pop(session_id, None)

        try:
            await current_websocket.close(code=1000)
        except Exception:
            pass

    async def send_command(
        self,
        session_id: int,
        command: str,
    ) -> bool:
        agent = self.agent_connections.get(session_id)

        if not agent:
            # Not logged: the viewer keeps sending while the agent
            # reconnects, which would flood the logs.
            return False

        try:
            await agent.send_text(command)
            return True

        except Exception as e:
            print(
                f"[CONTROL] Failed to forward command for session "
                f"{session_id}: {type(e).__name__}: {e}",
                flush=True,
            )

            await self.disconnect_agent(session_id, agent)

            return False

    def is_agent_connected(
        self,
        session_id: int,
    ) -> bool:
        return session_id in self.agent_connections


remote_control_manager = RemoteControlManager()
