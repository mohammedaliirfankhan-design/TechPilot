from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.agent import Agent
from app.models.shell_command import ShellCommand
from app.models.shell_session import ShellSession
from app.models.user import User
from app.schemas.shell import (
    ShellCommandCreateRequest,
    ShellCommandResponse,
    ShellSessionCreateRequest,
    ShellSessionResponse,
)
from app.security.agent_auth import get_current_agent
from app.services.organization import (
    get_user_default_organization,
)
from app.services.shell import (
    get_authorized_device,
    has_active_shell_session,
)


router = APIRouter(
    prefix="/api/v1/shell",
    tags=["Shell"],
)


# ----------------------------------------------------------------------
# User / administrator shell session endpoints
# ----------------------------------------------------------------------


@router.post(
    "/sessions",
    response_model=ShellSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_shell_session(
    request: ShellSessionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organization = get_user_default_organization(
        db,
        current_user,
    )

    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account must belong to exactly one active "
                "organization to access shell sessions."
            ),
        )

    agent, _ = get_authorized_device(
        db,
        current_user,
        request.device_id,
    )

    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this device.",
        )

    if has_active_shell_session(
        db,
        request.device_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A shell session is already active "
                "for this device."
            ),
        )

    shell_type = request.shell_type.upper()

    if shell_type not in {
        "POWERSHELL",
        "CMD",
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported shell type. "
                "Use POWERSHELL or CMD."
            ),
        )

    session = ShellSession(
        device_id=agent.device_id,
        user_id=current_user.id,
        organization_id=organization.id,
        shell_type=shell_type,
        status="REQUESTED",
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    return ShellSessionResponse(
        session_id=session.id,
        device_id=session.device_id,
        shell_type=session.shell_type,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
    )


@router.get(
    "/sessions/{session_id}",
    response_model=ShellSessionResponse,
)
def get_shell_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = (
        db.query(ShellSession)
        .filter(
            ShellSession.id == session_id,
            ShellSession.user_id == current_user.id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shell session not found.",
        )

    return ShellSessionResponse(
        session_id=session.id,
        device_id=session.device_id,
        shell_type=session.shell_type,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
    )


@router.post(
    "/sessions/{session_id}/close",
    response_model=ShellSessionResponse,
)
def close_shell_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = (
        db.query(ShellSession)
        .filter(
            ShellSession.id == session_id,
            ShellSession.user_id == current_user.id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shell session not found.",
        )

    if session.status != "ENDED":
        session.status = "ENDED"
        session.ended_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(session)

    return ShellSessionResponse(
        session_id=session.id,
        device_id=session.device_id,
        shell_type=session.shell_type,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
    )

# ----------------------------------------------------------------------
# User / administrator shell command endpoints
# ----------------------------------------------------------------------


@router.post(
    "/sessions/{session_id}/commands",
    response_model=ShellCommandResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_shell_command(
    session_id: int,
    request: ShellCommandCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = (
        db.query(ShellSession)
        .filter(
            ShellSession.id == session_id,
            ShellSession.user_id == current_user.id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shell session not found.",
        )

    if session.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Commands can only be submitted to "
                "an ACTIVE shell session."
            ),
        )

    command = ShellCommand(
        session_id=session.id,
        command=request.command,
        status="PENDING",
    )

    db.add(command)
    db.commit()
    db.refresh(command)

    return ShellCommandResponse(
        command_id=command.id,
        session_id=command.session_id,
        command=command.command,
        status=command.status,
        stdout=command.stdout,
        stderr=command.stderr,
        exit_code=command.exit_code,
        created_at=command.created_at,
        started_at=command.started_at,
        completed_at=command.completed_at,
    )


@router.get(
    "/commands/{command_id}",
    response_model=ShellCommandResponse,
)
def get_shell_command(
    command_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    command = (
        db.query(ShellCommand)
        .join(
            ShellSession,
            ShellSession.id == ShellCommand.session_id,
        )
        .filter(
            ShellCommand.id == command_id,
            ShellSession.user_id == current_user.id,
        )
        .first()
    )

    if command is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shell command not found.",
        )

    return ShellCommandResponse(
        command_id=command.id,
        session_id=command.session_id,
        command=command.command,
        status=command.status,
        stdout=command.stdout,
        stderr=command.stderr,
        exit_code=command.exit_code,
        created_at=command.created_at,
        started_at=command.started_at,
        completed_at=command.completed_at,
    )

# ----------------------------------------------------------------------
# Agent shell session endpoints
# ----------------------------------------------------------------------


@router.get(
    "/agent/sessions/pending/{device_id}",
)
def get_pending_shell_session(
    device_id: str,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    if current_agent.device_id != device_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent is not authorized for this device.",
        )

    session = (
        db.query(ShellSession)
        .filter(
            ShellSession.device_id == current_agent.device_id,
            ShellSession.status == "REQUESTED",
        )
        .order_by(ShellSession.started_at.asc())
        .first()
    )

    if session is None:
        return {
            "session": None,
        }

    return {
        "session": {
            "session_id": session.id,
            "device_id": session.device_id,
            "shell_type": session.shell_type,
            "status": session.status,
        }
    }


@router.post(
    "/agent/sessions/{session_id}/accept",
)
def accept_shell_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    session = (
        db.query(ShellSession)
        .filter(
            ShellSession.id == session_id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shell session not found.",
        )

    if session.device_id != current_agent.device_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent is not authorized for this shell session.",
        )

    if session.status != "REQUESTED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Shell session cannot be accepted "
                f"from status {session.status}."
            ),
        )

    session.status = "ACTIVE"

    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "device_id": session.device_id,
        "shell_type": session.shell_type,
        "status": session.status,
    }


@router.get(
    "/agent/sessions/{session_id}/status",
)
def get_agent_shell_session_status(
    session_id: int,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    session = (
        db.query(ShellSession)
        .filter(
            ShellSession.id == session_id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shell session not found.",
        )

    if session.device_id != current_agent.device_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent is not authorized for this shell session.",
        )

    return {
        "session_id": session.id,
        "device_id": session.device_id,
        "shell_type": session.shell_type,
        "status": session.status,
    }


# ----------------------------------------------------------------------
# Agent command polling / result endpoints
# ----------------------------------------------------------------------


@router.get(
    "/agent/sessions/{session_id}/commands/pending",
)
def get_pending_shell_command(
    session_id: int,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    session = (
        db.query(ShellSession)
        .filter(
            ShellSession.id == session_id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shell session not found.",
        )

    if session.device_id != current_agent.device_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent is not authorized for this shell session.",
        )

    if session.status != "ACTIVE":
        return {
            "command": None,
        }

    command = (
        db.query(ShellCommand)
        .filter(
            ShellCommand.session_id == session.id,
            ShellCommand.status == "PENDING",
        )
        .order_by(ShellCommand.created_at.asc())
        .with_for_update()
        .first()
    )

    if command is None:
        return {
            "command": None,
        }

    command.status = "RUNNING"
    command.started_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(command)

    return {
        "command": {
            "command_id": command.id,
            "session_id": command.session_id,
            "command": command.command,
            "status": command.status,
        }
    }


@router.post(
    "/agent/commands/{command_id}/result",
)
def submit_shell_command_result(
    command_id: int,
    result: dict,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    command = (
        db.query(ShellCommand)
        .filter(
            ShellCommand.id == command_id,
        )
        .first()
    )

    if command is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shell command not found.",
        )

    session = (
        db.query(ShellSession)
        .filter(
            ShellSession.id == command.session_id,
        )
        .first()
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shell session not found.",
        )

    if session.device_id != current_agent.device_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent is not authorized for this command.",
        )

    if command.status != "RUNNING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Shell command is not currently running."
            ),
        )

    stdout = result.get("stdout")
    stderr = result.get("stderr")
    exit_code = result.get("exit_code")
    timed_out = bool(result.get("timed_out", False))

    if stdout is not None and not isinstance(stdout, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stdout must be a string or null.",
        )

    if stderr is not None and not isinstance(stderr, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stderr must be a string or null.",
        )

    if exit_code is not None and not isinstance(exit_code, int):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="exit_code must be an integer or null.",
        )

    command.stdout = stdout
    command.stderr = stderr
    command.exit_code = exit_code
    command.completed_at = datetime.now(timezone.utc)

    if timed_out:
        command.status = "TIMEOUT"
    elif exit_code == 0:
        command.status = "COMPLETED"
    else:
        command.status = "FAILED"

    db.commit()
    db.refresh(command)

    return {
        "command_id": command.id,
        "session_id": command.session_id,
        "status": command.status,
        "exit_code": command.exit_code,
    }