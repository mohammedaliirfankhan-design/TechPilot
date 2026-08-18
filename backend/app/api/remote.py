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
from app.services.remote_stream import remote_stream_manager
from app.services.remote_control import remote_control_manager
import json

router = APIRouter(
    prefix="/api/v1/remote",
    tags=["Remote Support"]
)


@router.post("/sessions")
def create_remote_session(
    device_id: str,
    db: Session = Depends(get_db)
):
    # Check whether the device exists
    agent = (
        db.query(Agent)
        .filter(Agent.device_id == device_id)
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=404,
            detail="Device not found"
        )

    # Check whether there is already an active session
    active_session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.device_id == device_id,
            RemoteSession.status.in_(["REQUESTED", "CONNECTING", "ACTIVE"])
        )
        .first()
    )

    if active_session:
        raise HTTPException(
            status_code=409,
            detail="A remote session is already active for this device"
        )

    session = RemoteSession(
        device_id=device_id,
        status="REQUESTED"
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "status": "requested",
        "session_id": session.id,
        "device_id": session.device_id,
        "session_status": session.status
    }

@router.get("/sessions/pending/{device_id}")
def get_pending_session(
    device_id: str,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(
            RemoteSession.device_id == device_id,
            RemoteSession.status.in_(["REQUESTED", "ACCEPTED", "CONNECTING", "ACTIVE"])
        )
        .order_by(RemoteSession.id.desc())
        .first()
    )

    if not session:
        return {
            "pending": False
        }

    return {
        "pending": True,
        "session_id": session.id,
        "device_id": session.device_id,
        "status": session.status
    }

@router.post("/sessions/{session_id}/accept")
def accept_remote_session(
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Remote session not found"
        )

    if session.status != "REQUESTED":
        raise HTTPException(
            status_code=409,
            detail=f"Session cannot be accepted from status {session.status}"
        )

    session.status = "ACCEPTED"

    db.commit()
    db.refresh(session)

    return {
        "status": "accepted",
        "session_id": session.id,
        "device_id": session.device_id,
        "session_status": session.status
    }

@router.post("/sessions/{session_id}/connect")
def connect_remote_session(
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Remote session not found"
        )

    if session.status != "ACCEPTED":
        raise HTTPException(
            status_code=409,
            detail=f"Session cannot connect from status {session.status}"
        )

    session.status = "CONNECTING"

    db.commit()
    db.refresh(session)

    return {
        "status": "connecting",
        "session_id": session.id,
        "device_id": session.device_id,
        "session_status": session.status
    }

@router.get("/sessions/{session_id}")
def get_remote_session(
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Remote session not found"
        )

    return {
        "session_id": session.id,
        "device_id": session.device_id,
        "status": session.status,
        "started_at": session.started_at,
        "ended_at": session.ended_at
    }
@router.websocket("/sessions/{session_id}/stream")
async def remote_session_stream(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in ["CONNECTING", "ACTIVE"]:
        await websocket.close(code=1008)
        return

    await remote_stream_manager.connect_viewer(
        session_id,
        websocket
    )

    print(
        f"[REMOTE] Viewer connected for session {session_id}"
    )

    try:
        while True:
            await websocket.receive()

    except WebSocketDisconnect:
        print(
            f"[REMOTE] Viewer disconnected from session {session_id}"
        )

    except Exception as e:
        print(
            f"[REMOTE] Viewer stream error for session "
            f"{session_id}: {e}"
        )

    finally:
        await remote_stream_manager.disconnect_viewer(
            session_id
        )
@router.post("/sessions/{session_id}/disconnect")
def disconnect_remote_session(
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Remote session not found"
        )

    if session.status == "ENDED":
        raise HTTPException(
            status_code=409,
            detail="Remote session is already ended"
        )

    session.status = "ENDED"

    db.commit()
    db.refresh(session)

    return {
        "status": "ended",
        "session_id": session.id,
        "device_id": session.device_id,
        "session_status": session.status,
        "ended_at": session.ended_at
    }

@router.websocket("/sessions/{session_id}/agent-stream")
async def remote_agent_stream(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in ["CONNECTING", "ACTIVE"]:
        await websocket.close(code=1008)
        return

    await remote_stream_manager.connect_agent(
        session_id,
        websocket
    )

    session.status = "ACTIVE"

    db.commit()
    db.refresh(session)

    print(
        f"[REMOTE] Agent connected for session {session_id}"
    )

    try:
        while True:
            message = await websocket.receive()

            # Client disconnected
            if message.get("type") == "websocket.disconnect":
                print(
                    f"[REMOTE] Agent disconnected from session {session_id}"
                )
                break

            # Screen frame received
            if (
                message.get("type") == "websocket.receive"
                and message.get("bytes") is not None
            ):
                await remote_stream_manager.send_frame(
                    session_id,
                    message["bytes"]
                )

    except WebSocketDisconnect:
        print(
            f"[REMOTE] Agent disconnected from session {session_id}"
        )

    except Exception as e:
        print(
            f"[REMOTE] Agent stream error for session "
            f"{session_id}: {e}"
        )

    finally:
        await remote_stream_manager.disconnect_agent(
            session_id
        )
@router.websocket("/sessions/{session_id}/control")
async def remote_control_viewer(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in ["CONNECTING", "ACTIVE"]:
        await websocket.close(code=1008)
        return

    await websocket.accept()

    print(
        f"[CONTROL] Viewer connected for session {session_id}"
    )

    try:

        while True:

            message = await websocket.receive_text()

            print(
                f"[CONTROL] Command received from viewer "
                f"for session {session_id}: {message}"
            )

            await remote_control_manager.send_command(
                session_id,
                message
            )

    except WebSocketDisconnect:

        print(
            f"[CONTROL] Viewer disconnected "
            f"from session {session_id}"
        )

    except Exception as e:

        print(
            f"[CONTROL] Viewer control error "
            f"for session {session_id}: {e}"
        )


@router.websocket("/sessions/{session_id}/agent-control")
async def remote_agent_control(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in ["CONNECTING", "ACTIVE"]:
        await websocket.close(code=1008)
        return

    await remote_control_manager.connect_agent(
        session_id,
        websocket
    )

    try:

        while True:

            message = await websocket.receive_text()

            print(
                f"[CONTROL] Agent message for session "
                f"{session_id}: {message}"
            )

    except WebSocketDisconnect:

        print(
            f"[CONTROL] Agent disconnected from session "
            f"{session_id}"
        )

    except Exception as e:

        print(
            f"[CONTROL] Agent control error "
            f"for session {session_id}: {e}"
        )

    finally:

        await remote_control_manager.disconnect_agent(
            session_id
        )
@router.websocket("/sessions/{session_id}/control")
async def remote_control_viewer(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in ["CONNECTING", "ACTIVE"]:
        await websocket.close(code=1008)
        return

    await websocket.accept()

    print(
        f"[CONTROL] Viewer connected for session {session_id}"
    )

    try:

        while True:

            message = await websocket.receive_text()

            print(
                f"[CONTROL] Command received from viewer "
                f"for session {session_id}: {message}"
            )

            await remote_control_manager.send_command(
                session_id,
                message
            )

    except WebSocketDisconnect:

        print(
            f"[CONTROL] Viewer disconnected "
            f"from session {session_id}"
        )

    except Exception as e:

        print(
            f"[CONTROL] Viewer control error "
            f"for session {session_id}: {e}"
        )


@router.websocket("/sessions/{session_id}/agent-control")
async def remote_agent_control(
    websocket: WebSocket,
    session_id: int,
    db: Session = Depends(get_db)
):
    session = (
        db.query(RemoteSession)
        .filter(RemoteSession.id == session_id)
        .first()
    )

    if not session:
        await websocket.close(code=1008)
        return

    if session.status not in ["CONNECTING", "ACTIVE"]:
        await websocket.close(code=1008)
        return

    await remote_control_manager.connect_agent(
        session_id,
        websocket
    )

    try:

        while True:

            message = await websocket.receive_text()

            print(
                f"[CONTROL] Agent message for session "
                f"{session_id}: {message}"
            )

    except WebSocketDisconnect:

        print(
            f"[CONTROL] Agent disconnected from session "
            f"{session_id}"
        )

    except Exception as e:

        print(
            f"[CONTROL] Agent control error "
            f"for session {session_id}: {e}"
        )

    finally:

        await remote_control_manager.disconnect_agent(
            session_id
        )
@router.post("/sessions/{session_id}/control")
async def send_remote_control(
    session_id: int,
    command: dict,
):

    command_json = json.dumps(command)

    success = await remote_control_manager.send_command(
        session_id,
        command_json
    )

    if not success:

        return {
            "status": "failed",
            "message": "Agent control channel is not connected"
        }

    return {
        "status": "sent",
        "session_id": session_id,
        "command": command
    }