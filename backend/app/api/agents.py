from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.agent import Agent
from app.models.remote_session import RemoteSession
from app.models.user import User
from app.schemas.agent import (
    AgentRegisterRequest,
    AgentRenameRequest,
    AgentResponse,
)
from app.security.agent_auth import (
    generate_agent_token,
    get_current_agent,
    hash_agent_token,
)
from app.services.organization import (
    get_user_default_organization,
)


router = APIRouter(
    prefix="/api/v1/agents",
    tags=["Agents"],
)


@router.post(
    "/register",
    response_model=AgentResponse,
)
def register_agent(
    agent_data: AgentRegisterRequest,
    db: Session = Depends(get_db),
):
    existing_agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == agent_data.device_id
        )
        .first()
    )

    if existing_agent:
        return existing_agent

    agent = Agent(
        device_id=agent_data.device_id,
        hostname=agent_data.hostname,
        operating_system=agent_data.operating_system,
        os_version=agent_data.os_version,
        agent_version=agent_data.agent_version,
    )

    db.add(agent)
    db.commit()
    db.refresh(agent)

    return agent


@router.get(
    "/",
    response_model=list[AgentResponse],
)
def get_agents(
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
                "organization to access devices."
            ),
        )

    agents = (
        db.query(Agent)
        .filter(
            Agent.organization_id == organization.id
        )
        .order_by(Agent.id)
        .all()
    )

    return agents


@router.patch(
    "/{device_id}/display-name",
    response_model=AgentResponse,
)
def rename_agent(
    device_id: str,
    payload: AgentRenameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Set the name shown in the console. Only the display name
    changes; the hostname and device ID stay as the agent reported.
    """

    organization = get_user_default_organization(
        db,
        current_user,
    )

    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account must belong to exactly one active "
                "organization to manage devices."
            ),
        )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id,
            Agent.organization_id == organization.id,
        )
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found.",
        )

    name = (payload.display_name or "").strip()

    agent.display_name = name or None

    db.commit()
    db.refresh(agent)

    return agent


@router.delete("/{device_id}")
async def remove_agent(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove a device from the console.

    The row and its history are kept. The device is detached from
    the organization, its agent token is revoked (the agent on the
    PC can no longer connect), and any open remote session ends.
    The same PC can be enrolled again later with a new code.
    """

    # Imported here to avoid a circular import at startup.
    from app.api.remote import remote_stream_hub
    from app.services.remote_control import remote_control_manager

    organization = get_user_default_organization(
        db,
        current_user,
    )

    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account must belong to exactly one active "
                "organization to manage devices."
            ),
        )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id,
            Agent.organization_id == organization.id,
        )
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found.",
        )

    open_sessions = (
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

    for remote_session in open_sessions:
        remote_session.status = "ENDED"
        remote_session.ended_at = datetime.now(timezone.utc)

    agent.agent_token_hash = None
    agent.agent_token_created_at = None
    agent.organization_id = None
    agent.user_id = None
    agent.display_name = None

    db.commit()

    for remote_session in open_sessions:
        await remote_stream_hub.disconnect_session(remote_session.id)

        try:
            await remote_control_manager.disconnect_agent(remote_session.id)
        except Exception:
            pass

    print(
        f"[AGENTS] Device {device_id} removed by user {current_user.id}; "
        f"{len(open_sessions)} open session(s) ended",
        flush=True,
    )

    return {
        "status": "removed",
        "device_id": device_id,
    }


@router.post(
    "/{device_id}/claim",
    response_model=AgentResponse,
)
def claim_agent(
    device_id: str,
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
                "organization to claim devices."
            ),
        )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id
        )
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found.",
        )

    if agent.organization_id is not None:
        if agent.organization_id == organization.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This device is already assigned to "
                    "your organization."
                ),
            )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This device is already assigned to "
                "another organization."
            ),
        )

    if agent.user_id is not None:
        if agent.user_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This device is already assigned to "
                    "your account."
                ),
            )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This device is already assigned to "
                "another account."
            ),
        )

    agent.organization_id = organization.id
    agent.user_id = current_user.id

    db.commit()
    db.refresh(agent)

    return agent


@router.post("/{device_id}/enroll")
def enroll_agent(
    device_id: str,
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
                "organization to enroll devices."
            ),
        )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id
        )
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found.",
        )

    if agent.organization_id is not None:
        if agent.organization_id != organization.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This device is already assigned to "
                    "another organization."
                ),
            )

    if agent.user_id is not None and agent.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This device is already assigned to "
                "another account."
            ),
        )

    if agent.agent_token_hash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This device is already enrolled.",
        )

    agent.organization_id = organization.id
    agent.user_id = current_user.id

    agent_token = generate_agent_token()

    agent.agent_token_hash = hash_agent_token(
        agent_token
    )

    agent.agent_token_created_at = datetime.now(
        timezone.utc
    )

    db.commit()
    db.refresh(agent)

    return {
        "status": "enrolled",
        "device_id": agent.device_id,
        "agent_token": agent_token,
        "message": (
            "Agent enrolled successfully. "
            "Store this token securely; it will not be shown again."
        ),
    }


@router.post("/{device_id}/rotate-token")
def rotate_agent_token(
    device_id: str,
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
                "organization to manage device tokens."
            ),
        )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id,
            Agent.organization_id == organization.id,
        )
        .first()
    )

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found.",
        )

    agent_token = generate_agent_token()

    agent.agent_token_hash = hash_agent_token(
        agent_token
    )

    agent.agent_token_created_at = datetime.now(
        timezone.utc
    )

    db.commit()
    db.refresh(agent)

    return {
        "status": "rotated",
        "device_id": agent.device_id,
        "agent_token": agent_token,
        "message": (
            "Agent token rotated successfully. "
            "The previous token is no longer valid. "
            "Store this token securely; it will not be shown again."
        ),
    }


@router.post("/{device_id}/heartbeat")
def agent_heartbeat(
    device_id: str,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    if current_agent.device_id != device_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent credential does not match device.",
        )

    current_agent.last_seen = datetime.now(timezone.utc)

    db.commit()
    db.refresh(current_agent)

    return {
        "status": "online",
        "device_id": current_agent.device_id,
        "last_seen": current_agent.last_seen,
    }
