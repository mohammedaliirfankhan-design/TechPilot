from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.agent import Agent
from app.models.remote_session import RemoteSession
from app.services.remote_control import remote_control_manager


router = APIRouter(
    prefix="/api/v1/remote",
    tags=["Remote Support"],
)


# =========================================================
# IN-MEMORY REMOTE STREAM HUB
# =========================================================
#
# The previous implementation delegated frame delivery to
# remote_stream_manager. The agent was successfully sending
# fresh frames, but the viewer could remain on an old frame.
#
# This hub uses a "latest frame wins" design:
#
#   Agent -> latest_frame -> Viewer
#
# A slow viewer never blocks the agent. Old frames are
# discarded automatically and only the newest frame is sent.
# =========================================================

class _StreamChannel:
    def __init__(self) -> None:
        self.agent: Optional[WebSocket] = None
        self.viewer: Optional[WebSocket] = None
        self.latest_frame: Optional[bytes] = None
        self.frame_event = __import__("asyncio").Event()
        self.lock = __import__("asyncio").Lock()


class _RemoteStreamHub:
    def __init__(self) -> None:
        self.channels: dict[int, _StreamChannel] = {}
        self.channels_lock = __import__("asyncio").Lock()

    async def _get_channel(self, session_id: int) -> _StreamChannel:
        async with self.channels_lock:
            channel = self.channels.get(session_id)
            if channel is None:
                channel = _StreamChannel()
                self.channels[session_id] = channel
            return channel

    async def connect_agent(
        self,
        session_id: int,
        websocket: WebSocket,
    ) -> None:
        await websocket.accept()

        channel = await self._get_channel(session_id)

        async with channel.lock:
            old = channel.agent
            channel.agent = websocket

        if old is not None and old is not websocket:
            try:
                await old.close(code=1000)
            except Exception:
                pass

    async def connect_viewer(
        self,
        session_id: int,
        websocket: WebSocket,
    ) -> None:
        await websocket.accept()

        channel = await self._get_channel(session_id)

        async with channel.lock:
            old = channel.viewer
            channel.viewer = websocket

        if old is not None and old is not websocket:
            try:
                await old.close(code=1000)
            except Exception:
                pass

    async def send_frame(
        self,
        session_id: int,
        frame: bytes,
    ) -> None:
        channel = await self._get_channel(session_id)

        async with channel.lock:
            channel.latest_frame = frame
            channel.frame_event.set()

    async def stream_to_viewer(
        self,
        session_id: int,
        websocket: WebSocket,
    ) -> None:
        channel = await self._get_channel(session_id)

        while True:
            await channel.frame_event.wait()

            async with channel.lock:
                frame = channel.latest_frame
                channel.frame_event.clear()

                # Do not send anything if the viewer that owns
                # this stream has already been replaced/closed.
                if channel.viewer is not websocket:
                    return

            if not frame:
                continue

            try:
                await websocket.send_bytes(frame)
            except Exception:
                raise

            # If another frame arrived while send_bytes() was
            # running, frame_event will already be set and the
            # next loop sends the newest frame.

    async def disconnect_agent(
        self,
        session_id: int,
    ) -> None:
        channel = self.channels.get(session_id)
        if channel is None:
            return

        async with channel.lock:
            websocket = channel.agent
            channel.agent = None

        if websocket is not None:
            try:
                await websocket.close(code=1000)
            except Exception:
                pass

    async def disconnect_viewer(
        self,
        session_id: int,
    ) -> None:
        channel = self.channels.get(session_id)
        if channel is None:
            return

        async with channel.lock:
            websocket = channel.viewer
            channel.viewer = None

        if websocket is not None:
            try:
                await websocket.close(code=1000)
            except Exception:
                pass

    async def disconnect_session(
        self,
        session_id: int,
    ) -> None:
        channel = self.channels.get(session_id)
        if channel is None:
            return

        async with channel.lock:
            agent = channel.agent
            viewer = channel.viewer

            channel.agent = None
            channel.viewer = None
            channel.latest_frame = None
            channel.frame_event.set()

        for websocket in (agent, viewer):
            if websocket is not None:
                try:
                    await websocket.close(code=1000)
                except Exception:
                    pass

        async with self.channels_lock:
            self.channels.pop(session_id, None)


remote_stream_hub = _RemoteStreamHub()


# =========================================================
# CREATE REMOTE SESSION
# =========================================================

@router.post("/sessions")
def create_remote_session(
    device_id: str,
    db: Session = Depends(get_db),
):
    agent = (
        db.query(Agent)
        .filter(Agent.device_id == device_id)
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=404,
            detail="Device not found",
        )

    active_session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.device_id == device_id,
            RemoteSession.status.in_(
                [
                    "REQUESTED",
                    "ACCEPTED",
                    "CONNECTING",
                    "ACTIVE",
                ]
            ),
        )
        .first()
    )

    if active_session:
        raise HTTPException(
            status_code=409,
            detail="A remote session is already active for this device",
        )

    session = RemoteSession(
        device_id=device_id,
        status="REQUESTED",
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    print(
        f"[REMOTE] Created session "
        f"{session.id} for device {device_id}"
    )

    return {
        "status": "requested",
        "session_id": session.id,
        "device_id": session.device_id,
        "session_status": session.status,
    }


# =========================================================
# GET PENDING SESSION
# =========================================================

@router.get("/sessions/pending/{device_id}")
def get_pending_session(
    device_id: str,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.device_id == device_id,
            RemoteSession.status.in_(
                [
                    "REQUESTED",
                    "ACCEPTED",
                    "CONNECTING",
                    "ACTIVE",
                ]
            ),
        )
        .order_by(RemoteSession.id.desc())
        .first()
    )

    if not session:
        return {"pending": False}

    return {
        "pending": True,
        "session_id": session.id,
        "device_id": device_id,
        "status": session.status,
    }


# =========================================================
# ACCEPT REMOTE SESSION
# =========================================================

@router.post("/sessions/{session_id}/accept")
def accept_remote_session(
    session_id: int,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Remote session not found",
        )

    if session.status != "REQUESTED":
        raise HTTPException(
            status_code=409,
            detail=(
                "Session cannot be accepted "
                f"from status {session.status}"
            ),
        )

    session.status = "ACCEPTED"
    db.commit()
    db.refresh(session)

    print(
        f"[REMOTE] Session {session_id} accepted"
    )

    return {
        "status": "accepted",
        "session_id": session.id,
        "device_id": session.device_id,
        "session_status": session.status,
    }


# =========================================================
# CONNECT REMOTE SESSION
# =========================================================

@router.post("/sessions/{session_id}/connect")
def connect_remote_session(
    session_id: int,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Remote session not found",
        )

    if session.status != "ACCEPTED":
        raise HTTPException(
            status_code=409,
            detail=(
                "Session cannot connect "
                f"from status {session.status}"
            ),
        )

    session.status = "CONNECTING"
    db.commit()
    db.refresh(session)

    print(
        f"[REMOTE] Session {session_id} connecting"
    )

    return {
        "status": "connecting",
        "session_id": session.id,
        "device_id": session.device_id,
        "session_status": session.status,
    }


# =========================================================
# GET REMOTE SESSION
# =========================================================

@router.get("/sessions/{session_id}")
def get_remote_session(
    session_id: int,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Remote session not found",
        )

    return {
        "session_id": session.id,
        "device_id": session.device_id,
        "status": session.status,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
    }


# =========================================================
# END REMOTE SESSION
# =========================================================

@router.post("/sessions/{session_id}/disconnect")
async def disconnect_remote_session(
    session_id: int,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Remote session not found",
        )

    if session.status == "ENDED":
        await remote_stream_hub.disconnect_session(session_id)

        try:
            await remote_control_manager.disconnect_agent(session_id)
        except Exception:
            pass

        return {
            "status": "ended",
            "session_id": session.id,
            "device_id": session.device_id,
            "session_status": session.status,
            "ended_at": session.ended_at,
        }

    # Mark ENDED before closing sockets. This prevents stale
    # agent connections from being accepted again.
    session.status = "ENDED"
    session.ended_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(session)

    print(
        f"[REMOTE] Session {session_id} marked ENDED"
    )

    # Kill both stream sides.
    await remote_stream_hub.disconnect_session(session_id)

    # Kill the agent control channel.
    try:
        await remote_control_manager.disconnect_agent(session_id)
    except Exception as e:
        print(
            f"[REMOTE] Control disconnect warning for "
            f"session {session_id}: {type(e).__name__}: {e}"
        )

    print(
        f"[REMOTE] Session {session_id} ended. "
        f"All remote connections closed."
    )

    return {
        "status": "ended",
        "session_id": session.id,
        "device_id": session.device_id,
        "session_status": session.status,
        "ended_at": session.ended_at,
    }


# =========================================================
# VIEWER SCREEN STREAM
# =========================================================

@router.websocket("/sessions/{session_id}/stream")
async def remote_session_stream(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:
        print(
            f"[REMOTE] Rejected viewer stream for "
            f"session {session_id} with status {session.status}"
        )
        await websocket.close(code=1008)
        return

    await remote_stream_hub.connect_viewer(
        session_id,
        websocket,
    )

    print(
        f"[REMOTE] Viewer connected for session {session_id}"
    )

    try:
        await remote_stream_hub.stream_to_viewer(
            session_id,
            websocket,
        )

    except WebSocketDisconnect:
        print(
            f"[REMOTE] Viewer disconnected from "
            f"session {session_id}"
        )

    except Exception as e:
        print(
            f"[REMOTE] Viewer stream error for "
            f"session {session_id}: "
            f"{type(e).__name__}: {e}"
        )

    finally:
        await remote_stream_hub.disconnect_viewer(
            session_id
        )


# =========================================================
# AGENT SCREEN STREAM
# =========================================================

@router.websocket("/sessions/{session_id}/agent-stream")
async def remote_agent_stream(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:
        print(
            f"[REMOTE] Rejected agent stream for "
            f"session {session_id} with status {session.status}"
        )
        await websocket.close(code=1008)
        return

    await remote_stream_hub.connect_agent(
        session_id,
        websocket,
    )

    # Re-check after accept: End Session can race the handshake.
    db.refresh(session)

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:
        await remote_stream_hub.disconnect_agent(
            session_id
        )
        try:
            await websocket.close(code=1008)
        except Exception:
            pass
        return

    if session.status == "CONNECTING":
        session.status = "ACTIVE"
        db.commit()
        db.refresh(session)

    print(
        f"[REMOTE] Agent connected for session {session_id}"
    )

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                print(
                    f"[REMOTE] Agent disconnected from "
                    f"session {session_id}"
                )
                break

            frame = message.get("bytes")

            if (
                message.get("type") == "websocket.receive"
                and frame is not None
            ):
                await remote_stream_hub.send_frame(
                    session_id,
                    frame,
                )

    except WebSocketDisconnect:
        print(
            f"[REMOTE] Agent disconnected from "
            f"session {session_id}"
        )

    except Exception as e:
        print(
            f"[REMOTE] Agent stream error for "
            f"session {session_id}: "
            f"{type(e).__name__}: {e}"
        )

    finally:
        await remote_stream_hub.disconnect_agent(
            session_id
        )


# =========================================================
# VIEWER CONTROL CHANNEL
# =========================================================

@router.websocket("/sessions/{session_id}/control")
async def remote_control_viewer(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:
        await websocket.close(code=1008)
        return

    await websocket.accept()

    print(
        f"[CONTROL] Viewer connected for session {session_id}"
    )

    try:
        while True:
            message = await websocket.receive_text()

            # IMPORTANT:
            # Do not do expensive work here. The frontend already
            # coalesces mouse movement. Forward immediately.
            success = await remote_control_manager.send_command(
                session_id,
                message,
            )

            if not success:
                print(
                    f"[CONTROL] Agent control channel unavailable "
                    f"for session {session_id}"
                )

    except WebSocketDisconnect:
        print(
            f"[CONTROL] Viewer control disconnected "
            f"from session {session_id}"
        )

    except Exception as e:
        print(
            f"[CONTROL] Viewer control error for "
            f"session {session_id}: "
            f"{type(e).__name__}: {e}"
        )


# =========================================================
# AGENT CONTROL CHANNEL
# =========================================================

@router.websocket("/sessions/{session_id}/agent-control")
async def remote_agent_control(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db),
):
    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.id == session_id
        )
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:
        print(
            f"[CONTROL] Rejected agent control for "
            f"session {session_id} with status {session.status}"
        )
        await websocket.close(code=1008)
        return

    await remote_control_manager.connect_agent(
        session_id,
        websocket,
    )

    db.refresh(session)

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:
        await remote_control_manager.disconnect_agent(
            session_id
        )
        try:
            await websocket.close(code=1008)
        except Exception:
            pass
        return

    print(
        f"[CONTROL] Agent control connected "
        f"for session {session_id}"
    )

    try:
        while True:
            message = await websocket.receive_text()

            # The agent normally does not need to reply, but
            # receiving here keeps the socket alive and makes
            # disconnect detection deterministic.
            print(
                f"[CONTROL] Agent message for "
                f"session {session_id}: {message}"
            )

    except WebSocketDisconnect:
        print(
            f"[CONTROL] Agent control disconnected "
            f"from session {session_id}"
        )

    except Exception as e:
        print(
            f"[CONTROL] Agent control error for "
            f"session {session_id}: "
            f"{type(e).__name__}: {e}"
        )

    finally:
        await remote_control_manager.disconnect_agent(
            session_id
        )