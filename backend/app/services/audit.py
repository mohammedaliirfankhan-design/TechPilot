from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


def record_audit_event(
    db: Session,
    *,
    organization_id: int,
    event_type: str,
    category: str,
    action: str,
    resource_type: str,
    status: str,
    risk_level: str,
    message: str,
    user_id: int | None = None,
    device_id: str | None = None,
    resource_id: str | None = None,
    event_metadata: dict | None = None,
) -> AuditEvent:
    event = AuditEvent(
        organization_id=organization_id,
        user_id=user_id,
        device_id=device_id,
        event_type=event_type,
        category=category,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        status=status,
        risk_level=risk_level,
        message=message,
        event_metadata=event_metadata,
        created_at=datetime.now(timezone.utc),
    )

    db.add(event)

    return event