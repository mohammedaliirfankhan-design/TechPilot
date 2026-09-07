from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.agent import Agent
from app.models.user import User
from app.schemas.device_enrollment import (
    DeviceEnrollmentCompleteRequest,
    DeviceEnrollmentCompleteResponse,
    DeviceEnrollmentCreateResponse,
)
from app.security.agent_auth import (
    generate_agent_token,
    hash_agent_token,
)
from app.services.device_enrollment import (
    consume_enrollment_token,
    create_enrollment_token,
)
from app.services.organization import (
    get_user_default_organization,
)


router = APIRouter(
    prefix="/api/v1/device-enrollments",
    tags=["Device Enrollment"],
)


@router.post(
    "",
    response_model=DeviceEnrollmentCreateResponse,
)
def create_device_enrollment(
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

    enrollment, enrollment_code = create_enrollment_token(
        db,
        organization_id=organization.id,
        created_by_user_id=current_user.id,
    )

    return {
        "status": "created",
        "enrollment_code": enrollment_code,
        "expires_at": enrollment.expires_at,
        "message": (
            "Enrollment code created successfully. "
            "The code expires in 15 minutes and can only be used once."
        ),
    }


@router.post(
    "/complete",
    response_model=DeviceEnrollmentCompleteResponse,
)
def complete_device_enrollment(
    enrollment_data: DeviceEnrollmentCompleteRequest,
    db: Session = Depends(get_db),
):
    enrollment = consume_enrollment_token(
        db,
        enrollment_code=enrollment_data.enrollment_code,
        device_id=enrollment_data.device_id,
    )

    if enrollment is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid, expired, or already-used enrollment code.",
        )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == enrollment_data.device_id
        )
        .first()
    )

    if agent is None:
        agent = Agent(
            device_id=enrollment_data.device_id,
            hostname=enrollment_data.hostname,
            operating_system=enrollment_data.operating_system,
            os_version=enrollment_data.os_version,
            agent_version=enrollment_data.agent_version,
        )

        db.add(agent)
        db.flush()

    else:
        if agent.organization_id is not None:
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This device is already assigned to an organization."
                ),
            )

        if agent.agent_token_hash is not None:
            db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This device is already enrolled.",
            )

        agent.hostname = enrollment_data.hostname
        agent.operating_system = enrollment_data.operating_system
        agent.os_version = enrollment_data.os_version
        agent.agent_version = enrollment_data.agent_version

    agent.organization_id = enrollment.organization_id
    agent.user_id = enrollment.created_by_user_id

    agent_token = generate_agent_token()

    agent.agent_token_hash = hash_agent_token(
        agent_token
    )

    from datetime import datetime, timezone

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
            "Device enrolled successfully. "
            "Store the Agent token securely; it will not be shown again."
        ),
    }