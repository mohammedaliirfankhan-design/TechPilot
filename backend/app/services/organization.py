from sqlalchemy.orm import Session

from app.models.organization import Organization
from app.models.organization_user import OrganizationUser
from app.models.user import User
from app.schemas.organization import OrganizationMemberResponse


ORGANIZATION_ROLES = {
    "OWNER",
    "ADMIN",
    "TECHNICIAN",
    "VIEWER",
}


def get_user_organizations(
    db: Session,
    user: User,
) -> list[Organization]:
    return (
        db.query(Organization)
        .join(
            OrganizationUser,
            OrganizationUser.organization_id == Organization.id,
        )
        .filter(
            OrganizationUser.user_id == user.id,
            Organization.status == "ACTIVE",
        )
        .order_by(Organization.id)
        .all()
    )


def get_user_organization(
    db: Session,
    user: User,
    organization_id: int,
) -> Organization | None:
    return (
        db.query(Organization)
        .join(
            OrganizationUser,
            OrganizationUser.organization_id == Organization.id,
        )
        .filter(
            Organization.id == organization_id,
            OrganizationUser.user_id == user.id,
            Organization.status == "ACTIVE",
        )
        .first()
    )


def get_user_organization_membership(
    db: Session,
    user: User,
    organization_id: int,
) -> OrganizationUser | None:
    return (
        db.query(OrganizationUser)
        .filter(
            OrganizationUser.organization_id == organization_id,
            OrganizationUser.user_id == user.id,
        )
        .first()
    )


def get_organization_members(
    db: Session,
    organization_id: int,
) -> list[OrganizationMemberResponse]:
    rows = (
        db.query(
            OrganizationUser,
            User.email,
        )
        .join(
            User,
            User.id == OrganizationUser.user_id,
        )
        .filter(
            OrganizationUser.organization_id == organization_id,
        )
        .order_by(OrganizationUser.id)
        .all()
    )

    return [
        OrganizationMemberResponse(
            user_id=membership.user_id,
            email=email,
            role=membership.role,
            created_at=membership.created_at,
        )
        for membership, email in rows
    ]

def get_user_default_organization(
    db: Session,
    user: User,
) -> Organization | None:
    organizations = get_user_organizations(
        db,
        user,
    )

    if len(organizations) != 1:
        return None

    return organizations[0]