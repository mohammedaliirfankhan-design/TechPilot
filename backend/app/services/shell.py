from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.shell_session import ShellSession
from app.models.user import User
from app.services.organization import get_user_default_organization


ACTIVE_SHELL_SESSION_STATUSES = {
    "REQUESTED",
    "ACTIVE",
}


def get_authorized_device(
    db: Session,
    user: User,
    device_id: str,
) -> tuple[Agent | None, object | None]:
    organization = get_user_default_organization(
        db,
        user,
    )

    if organization is None:
        return None, None

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id,
            Agent.organization_id == organization.id,
            Agent.user_id == user.id,
        )
        .first()
    )

    return agent, organization


def has_active_shell_session(
    db: Session,
    device_id: str,
) -> bool:
    session = (
        db.query(ShellSession)
        .filter(
            ShellSession.device_id == device_id,
            ShellSession.status.in_(
                ACTIVE_SHELL_SESSION_STATUSES
            ),
        )
        .first()
    )

    return session is not None