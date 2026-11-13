import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.agent import Agent
from app.models.remote_session import RemoteSession
from app.services.remote_control import remote_control_manager
from app.api.auth import get_current_user
from app.services.auth import decode_access_token
from app.models.user import User
from app.security.agent_auth import (
    get_current_agent,
    authenticate_agent_websocket,
)


router = APIRouter(
    prefix="/api/v1/remote",
    tags=["Remote Support"],
)


def authenticate_websocket(
    websocket: WebSocket,
    db: Session,
) -> User | None:
    token = websocket.query_params.get("token")

    if not token:
        return None

    user_id = decode_access_token(token)

    if user_id is None:
        return None

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user or not user.is_active:
        return None

    return user


def user_owns_session(
    session: RemoteSession,
    user: User,
    db: Session,
) -> bool:
    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == session.device_id,
            Agent.user_id == user.id,
        )
        .first()
    )

    return agent is not None


# =========================================================
# IN-MEMORY REMOTE STREAM HUB
# =========================================================


class _StreamChannel:

    def __init__(self) -> None:

        self.agent: Optional[WebSocket] = None

        self.viewer: Optional[WebSocket] = None

        self.latest_frame: Optional[bytes] = None

        self.frame_version: int = 0

        self.condition = asyncio.Condition()

        self.closed: bool = False


class _RemoteStreamHub:

    def __init__(self) -> None:

        self.channels: dict[int, _StreamChannel] = {}

        self.channels_lock = asyncio.Lock()

    async def _get_channel(
        self,
        session_id: int,
    ) -> _StreamChannel:

        async with self.channels_lock:

            channel = self.channels.get(
                session_id
            )

            if channel is None:

                channel = _StreamChannel()

                self.channels[
                    session_id
                ] = channel

            return channel

    # =====================================================
    # CONNECT AGENT
    # =====================================================

    async def connect_agent(
        self,
        session_id: int,
        websocket: WebSocket,
    ) -> None:

        await websocket.accept()

        channel = await self._get_channel(
            session_id
        )

        old_agent: Optional[WebSocket] = None

        async with channel.condition:

            old_agent = channel.agent

            channel.agent = websocket

            channel.closed = False

            channel.condition.notify_all()

        if (
            old_agent is not None
            and old_agent is not websocket
        ):

            try:
                await old_agent.close(
                    code=1000
                )
            except Exception:
                pass

    # =====================================================
    # CONNECT VIEWER
    # =====================================================

    async def connect_viewer(
        self,
        session_id: int,
        websocket: WebSocket,
    ) -> None:

        await websocket.accept()

        channel = await self._get_channel(
            session_id
        )

        old_viewer: Optional[WebSocket] = None

        async with channel.condition:

            old_viewer = channel.viewer

            channel.viewer = websocket

            channel.closed = False

            channel.condition.notify_all()

        if (
            old_viewer is not None
            and old_viewer is not websocket
        ):

            try:
                await old_viewer.close(
                    code=1000
                )
            except Exception:
                pass

    # =====================================================
    # RECEIVE FRAME FROM AGENT
    # =====================================================

    async def send_frame(
        self,
        session_id: int,
        frame: bytes,
    ) -> None:

        channel = await self._get_channel(
            session_id
        )

        async with channel.condition:

            channel.latest_frame = frame

            channel.frame_version += 1

            channel.condition.notify_all()

    # =====================================================
    # STREAM FRAMES TO VIEWER
    # =====================================================

    async def stream_to_viewer(
        self,
        session_id: int,
        websocket: WebSocket,
    ) -> None:

        channel = await self._get_channel(
            session_id
        )

        last_sent_version = 0

        while True:

            async with channel.condition:

                await channel.condition.wait_for(
                    lambda:
                        channel.closed
                        or channel.viewer is not websocket
                        or (
                            channel.latest_frame is not None
                            and channel.frame_version
                            > last_sent_version
                        )
                )

                if (
                    channel.closed
                    or channel.viewer is not websocket
                ):
                    return

                frame = channel.latest_frame

                current_version = (
                    channel.frame_version
                )

                if not frame:
                    continue

            try:

                await websocket.send_bytes(
                    frame
                )

            except Exception:

                raise

            last_sent_version = current_version

    # =====================================================
    # DISCONNECT VIEWER
    # =====================================================

    async def disconnect_viewer(
        self,
        session_id: int,
        websocket: Optional[WebSocket] = None,
    ) -> None:

        channel = self.channels.get(
            session_id
        )

        if channel is None:
            return

        current_websocket: Optional[WebSocket] = None

        async with channel.condition:

            if (
                websocket is not None
                and channel.viewer is not websocket
            ):
                return

            current_websocket = channel.viewer

            channel.viewer = None

            channel.condition.notify_all()

        if current_websocket is not None:

            try:
                await current_websocket.close(
                    code=1000
                )
            except Exception:
                pass

    # =====================================================
    # DISCONNECT AGENT
    # =====================================================

    async def disconnect_agent(
        self,
        session_id: int,
        websocket: Optional[WebSocket] = None,
    ) -> None:

        channel = self.channels.get(
            session_id
        )

        if channel is None:
            return

        current_websocket: Optional[WebSocket] = None

        async with channel.condition:

            if (
                websocket is not None
                and channel.agent is not websocket
            ):
                return

            current_websocket = channel.agent

            channel.agent = None

            channel.condition.notify_all()

        if current_websocket is not None:

            try:
                await current_websocket.close(
                    code=1000
                )
            except Exception:
                pass

    # =====================================================
    # DISCONNECT ENTIRE SESSION
    # =====================================================

    async def disconnect_session(
        self,
        session_id: int,
    ) -> None:

        channel = self.channels.get(
            session_id
        )

        if channel is None:
            return

        agent_socket: Optional[WebSocket] = None
        viewer_socket: Optional[WebSocket] = None

        async with channel.condition:

            channel.closed = True

            agent_socket = channel.agent
            viewer_socket = channel.viewer

            channel.agent = None
            channel.viewer = None

            channel.latest_frame = None

            channel.condition.notify_all()

        for socket in (
            agent_socket,
            viewer_socket,
        ):

            if socket is not None:

                try:
                    await socket.close(
                        code=1000
                    )
                except Exception:
                    pass

        async with self.channels_lock:

            current = self.channels.get(
                session_id
            )

            if current is channel:

                self.channels.pop(
                    session_id,
                    None,
                )

    # =====================================================
    # CHECK AGENT CONNECTION
    # =====================================================

    def is_agent_connected(
        self,
        session_id: int,
    ) -> bool:

        channel = self.channels.get(
            session_id
        )

        if channel is None:
            return False

        return channel.agent is not None


remote_stream_hub = _RemoteStreamHub()


# =========================================================
# MAYBE END AGENT SESSION
# =========================================================


async def maybe_end_agent_session(
    session_id: int,
    db: Session,
) -> None:

    screen_connected = (
        remote_stream_hub.is_agent_connected(
            session_id
        )
    )

    control_connected = (
        remote_control_manager.is_agent_connected(
            session_id
        )
    )

    if (
        screen_connected
        or control_connected
    ):
        return

    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.id == session_id
        )
        .first()
    )

    if session is None:
        return

    if session.status == "ENDED":
        return

    session.status = "ENDED"

    session.ended_at = datetime.now(
        timezone.utc
    )

    db.commit()

    db.refresh(session)

    print(
        f"[REMOTE] Agent disconnected completely. "
        f"Session {session_id} marked ENDED.",
        flush=True,
    )


# =========================================================
# CREATE REMOTE SESSION
# =========================================================


@router.post("/sessions")
async def create_remote_session(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id
        )
        .first()
    )

    if not agent:

        raise HTTPException(
            status_code=404,
            detail="Device not found",
        )

    if agent.user_id != current_user.id:

        raise HTTPException(
            status_code=403,
            detail="You do not have access to this device.",
        )

    # Starting a new session replaces any earlier unfinished one
    # for this device (closed tab, crashed browser, agent offline).
    # Ownership of the device was checked above.
    stale_sessions = (
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
        .all()
    )

    for stale in stale_sessions:
        stale.status = "ENDED"
        stale.ended_at = datetime.now(timezone.utc)

    if stale_sessions:
        db.commit()

    for stale in stale_sessions:
        await remote_stream_hub.disconnect_session(stale.id)

        try:
            await remote_control_manager.disconnect_agent(stale.id)
        except Exception:
            pass

        print(
            f"[REMOTE] Session {stale.id} replaced by a new session request",
            flush=True,
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
        f"{session.id} for device "
        f"{device_id}"
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


@router.get(
    "/sessions/pending/{device_id}"
)
def get_pending_session(
    device_id: str,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):

    # -----------------------------------------------------
    # VERIFY AGENT CREDENTIAL MATCHES DEVICE
    # -----------------------------------------------------

    if current_agent.device_id != device_id:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent credential does not match device.",
        )

    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.device_id
            == device_id,
            RemoteSession.status.in_(
                [
                    "REQUESTED",
                    "ACCEPTED",
                    "CONNECTING",
                    "ACTIVE",
                ]
            ),
        )
        .order_by(
            RemoteSession.id.desc()
        )
        .first()
    )

    if not session:

        return {
            "pending": False
        }

    return {
        "pending": True,
        "session_id": session.id,
        "device_id": device_id,
        "status": session.status,
    }


# =========================================================
# ACCEPT REMOTE SESSION
# =========================================================


@router.post(
    "/sessions/{session_id}/accept"
)
def accept_remote_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):

    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.id == session_id
        )
        .first()
    )

    if not session:

        raise HTTPException(
            status_code=404,
            detail="Remote session not found",
        )

    # -----------------------------------------------------
    # VERIFY AGENT OWNS THE SESSION'S DEVICE
    # -----------------------------------------------------

    if current_agent.device_id != session.device_id:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent credential does not match session device.",
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
        f"[REMOTE] Session "
        f"{session_id} accepted"
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


@router.post(
    "/sessions/{session_id}/connect"
)
def connect_remote_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):

    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.id == session_id
        )
        .first()
    )

    if not session:

        raise HTTPException(
            status_code=404,
            detail="Remote session not found",
        )

    # -----------------------------------------------------
    # VERIFY AGENT OWNS THE SESSION'S DEVICE
    # -----------------------------------------------------

    if current_agent.device_id != session.device_id:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent credential does not match session device.",
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
        f"[REMOTE] Session "
        f"{session_id} connecting"
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


@router.get(
    "/sessions/{session_id}"
)
def get_remote_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):

    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.id == session_id
        )
        .first()
    )

    if not session:

        raise HTTPException(
            status_code=404,
            detail="Remote session not found",
        )

    # -----------------------------------------------------
    # VERIFY AGENT OWNS THE SESSION'S DEVICE
    # -----------------------------------------------------

    if current_agent.device_id != session.device_id:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent credential does not match session device.",
        )

    return {
        "session_id": session.id,
        "device_id": session.device_id,
        "status": session.status,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
    }


# =========================================================
# GET REMOTE SESSION (VIEWER)
# =========================================================


@router.get(
    "/sessions/{session_id}/viewer"
)
def get_remote_session_for_viewer(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.id == session_id
        )
        .first()
    )

    if not session:

        raise HTTPException(
            status_code=404,
            detail="Remote session not found",
        )

    if not user_owns_session(
        session,
        current_user,
        db,
    ):

        raise HTTPException(
            status_code=403,
            detail="You do not have access to this session.",
        )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == session.device_id
        )
        .first()
    )

    return {
        "session_id": session.id,
        "device_id": session.device_id,
        "hostname": agent.hostname if agent else None,
        "status": session.status,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
    }


# =========================================================
# END REMOTE SESSION
# =========================================================


@router.post(
    "/sessions/{session_id}/disconnect"
)
async def disconnect_remote_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.id == session_id
        )
        .first()
    )

    if not session:

        raise HTTPException(
            status_code=404,
            detail="Remote session not found",
        )

    if not user_owns_session(
        session,
        current_user,
        db,
    ):

        raise HTTPException(
            status_code=403,
            detail="You do not have access to this session.",
        )

    if session.status != "ENDED":

        session.status = "ENDED"

        session.ended_at = datetime.now(
            timezone.utc
        )

        db.commit()

        db.refresh(session)

        print(
            f"[REMOTE] Session "
            f"{session_id} marked ENDED"
        )

    await remote_stream_hub.disconnect_session(
        session_id
    )

    try:

        await remote_control_manager.disconnect_agent(
            session_id
        )

    except Exception as e:

        print(
            f"[REMOTE] Control disconnect warning "
            f"for session {session_id}: "
            f"{type(e).__name__}: {e}"
        )

    print(
        f"[REMOTE] Session "
        f"{session_id} ended. "
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


@router.websocket(
    "/sessions/{session_id}/stream"
)
async def remote_session_stream(
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

        await websocket.close(
            code=1008,
            reason="Session not found",
        )

        return

    user = authenticate_websocket(
        websocket,
        db,
    )

    if user is None:

        await websocket.close(
            code=1008,
            reason="Authentication required",
        )

        return

    if not user_owns_session(
        session,
        user,
        db,
    ):

        await websocket.close(
            code=1008,
            reason="Access denied",
        )

        return

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:

        print(
            f"[REMOTE] Rejected viewer stream "
            f"for session {session_id} "
            f"with status {session.status}"
        )

        await websocket.close(
            code=1008,
            reason="Session is not active",
        )

        return

    await remote_stream_hub.connect_viewer(
        session_id,
        websocket,
    )

    print(
        f"[REMOTE] Viewer connected "
        f"for session {session_id}"
    )

    try:

        await remote_stream_hub.stream_to_viewer(
            session_id,
            websocket,
        )

    except WebSocketDisconnect:

        print(
            f"[REMOTE] Viewer disconnected "
            f"from session {session_id}"
        )

    except Exception as e:

        print(
            f"[REMOTE] Viewer stream error "
            f"for session {session_id}: "
            f"{type(e).__name__}: {e}"
        )

    finally:

        await remote_stream_hub.disconnect_viewer(
            session_id,
            websocket,
        )

        await maybe_end_agent_session(
            session_id,
            db,
        )


# =========================================================
# AGENT SCREEN STREAM
# =========================================================


@router.websocket(
    "/sessions/{session_id}/agent-stream"
)
async def remote_agent_stream(
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

        await websocket.close(
            code=1008,
            reason="Session not found",
        )

        return

    # ---------------------------------------------------------
    # AUTHENTICATE AGENT BEFORE ACCEPTING WEBSOCKET
    # ---------------------------------------------------------

    current_agent = authenticate_agent_websocket(
        websocket,
        db,
    )

    if current_agent is None:

        await websocket.close(
            code=1008,
            reason="Agent authentication required",
        )

        return

    # ---------------------------------------------------------
    # VERIFY AGENT OWNS THE SESSION DEVICE
    # ---------------------------------------------------------

    if current_agent.device_id != session.device_id:

        await websocket.close(
            code=1008,
            reason="Agent credential does not match session device",
        )

        return

    # ---------------------------------------------------------
    # VERIFY SESSION STATE
    # ---------------------------------------------------------

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:

        print(
            f"[REMOTE] Rejected agent stream "
            f"for session {session_id} "
            f"with status {session.status}"
        )

        await websocket.close(
            code=1008,
            reason="Session is not active",
        )

        return

    # ---------------------------------------------------------
    # ACCEPT AUTHENTICATED AGENT CONNECTION
    # ---------------------------------------------------------

    await remote_stream_hub.connect_agent(
        session_id,
        websocket,
    )

    # Re-check after accepting the socket.
    # End Session can race the handshake.
    db.refresh(session)

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:

        await remote_stream_hub.disconnect_agent(
            session_id,
            websocket,
        )

        try:

            await websocket.close(
                code=1008
            )

        except Exception:
            pass

        return

    if session.status == "CONNECTING":

        session.status = "ACTIVE"

        db.commit()

        db.refresh(session)

    print(
        f"[REMOTE] Agent connected "
        f"for session {session_id}"
    )

    try:

        while True:

            message = (
                await websocket.receive()
            )

            if (
                message.get("type")
                == "websocket.disconnect"
            ):

                print(
                    f"[REMOTE] Agent disconnected "
                    f"from session {session_id}"
                )

                break

            frame = message.get(
                "bytes"
            )

            if (
                message.get("type")
                == "websocket.receive"
                and frame is not None
            ):

                await remote_stream_hub.send_frame(
                    session_id,
                    frame,
                )

    except WebSocketDisconnect:

        print(
            f"[REMOTE] Agent disconnected "
            f"from session {session_id}"
        )

    except Exception as e:

        print(
            f"[REMOTE] Agent stream error "
            f"for session {session_id}: "
            f"{type(e).__name__}: {e}"
        )

    finally:

        await remote_stream_hub.disconnect_agent(
            session_id,
            websocket,
        )

        await maybe_end_agent_session(
            session_id,
            db,
        )

# =========================================================
# VIEWER CONTROL CHANNEL
# =========================================================


@router.websocket(
    "/sessions/{session_id}/control"
)
async def remote_control_viewer(
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

        await websocket.close(
            code=1008,
            reason="Session not found",
        )

        return

    user = authenticate_websocket(
        websocket,
        db,
    )

    if user is None:

        await websocket.close(
            code=1008,
            reason="Authentication required",
        )

        return

    if not user_owns_session(
        session,
        user,
        db,
    ):

        await websocket.close(
            code=1008,
            reason="Access denied",
        )

        return

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:

        await websocket.close(
            code=1008,
            reason="Session is not active",
        )

        return

    await websocket.accept()

    print(
        f"[CONTROL] Viewer connected "
        f"for session {session_id}"
    )

    try:

        while True:

            message = (
                await websocket.receive_text()
            )

            success = (
                await remote_control_manager.send_command(
                    session_id,
                    message,
                )
            )

            if not success:

                print(
                    f"[CONTROL] Agent control "
                    f"channel unavailable "
                    f"for session {session_id}"
                )

    except WebSocketDisconnect:

        print(
            f"[CONTROL] Viewer control "
            f"disconnected from session "
            f"{session_id}"
        )

    except Exception as e:

        print(
            f"[CONTROL] Viewer control error "
            f"for session {session_id}: "
            f"{type(e).__name__}: {e}"
        )


# =========================================================
# AGENT CONTROL CHANNEL
# =========================================================


@router.websocket(
    "/sessions/{session_id}/agent-control"
)
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

        await websocket.close(
            code=1008,
            reason="Session not found",
        )

        return

    # ---------------------------------------------------------
    # AUTHENTICATE AGENT BEFORE ACCEPTING WEBSOCKET
    # ---------------------------------------------------------

    current_agent = authenticate_agent_websocket(
        websocket,
        db,
    )

    if current_agent is None:

        await websocket.close(
            code=1008,
            reason="Agent authentication required",
        )

        return

    # ---------------------------------------------------------
    # VERIFY AGENT OWNS THE SESSION DEVICE
    # ---------------------------------------------------------

    if current_agent.device_id != session.device_id:

        await websocket.close(
            code=1008,
            reason="Agent credential does not match session device",
        )

        return

    # ---------------------------------------------------------
    # VERIFY SESSION STATE
    # ---------------------------------------------------------

    if session.status not in [
        "CONNECTING",
        "ACTIVE",
    ]:

        print(
            f"[CONTROL] Rejected agent control "
            f"for session {session_id} "
            f"with status {session.status}"
        )

        await websocket.close(
            code=1008,
            reason="Session is not active",
        )

        return

    # ---------------------------------------------------------
    # ACCEPT AUTHENTICATED AGENT CONNECTION
    # ---------------------------------------------------------

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
            session_id,
            websocket,
        )

        try:

            await websocket.close(
                code=1008
            )

        except Exception:
            pass

        return

    print(
        f"[CONTROL] Agent control connected "
        f"for session {session_id}"
    )

    try:

        while True:

            # The agent sends nothing on this socket today. Keep
            # reading so disconnects and pings are handled.
            await websocket.receive_text()

    except WebSocketDisconnect:

        print(
            f"[CONTROL] Agent control "
            f"disconnected from session "
            f"{session_id}"
        )

    except Exception as e:

        print(
            f"[CONTROL] Agent control error "
            f"for session {session_id}: "
            f"{type(e).__name__}: {e}"
        )

    finally:

        await remote_control_manager.disconnect_agent(
            session_id,
            websocket,
        )