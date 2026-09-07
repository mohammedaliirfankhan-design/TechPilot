from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from sqlalchemy.orm import Session

from app.models.device_enrollment_token import DeviceEnrollmentToken


ENROLLMENT_CODE_PREFIX = "TP-"
ENROLLMENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ENROLLMENT_CODE_LENGTH = 8
ENROLLMENT_CODE_EXPIRE_MINUTES = 15


def generate_enrollment_code() -> str:
    """Generate a short, human-friendly one-time enrollment code."""

    code = "".join(
        secrets.choice(ENROLLMENT_CODE_ALPHABET)
        for _ in range(ENROLLMENT_CODE_LENGTH)
    )

    return f"{ENROLLMENT_CODE_PREFIX}{code[:4]}-{code[4:]}"


def normalize_enrollment_code(code: str) -> str:
    """Normalize user-entered enrollment codes."""

    return code.strip().upper()


def hash_enrollment_code(code: str) -> str:
    """Hash an enrollment code before storing or comparing it."""

    return hashlib.sha256(
        normalize_enrollment_code(code).encode("utf-8")
    ).hexdigest()


def create_enrollment_token(
    db: Session,
    organization_id: int,
    created_by_user_id: int,
) -> tuple[DeviceEnrollmentToken, str]:

    enrollment_code = generate_enrollment_code()

    enrollment = DeviceEnrollmentToken(
        organization_id=organization_id,
        created_by_user_id=created_by_user_id,
        token_hash=hash_enrollment_code(enrollment_code),
        expires_at=(
            datetime.now(timezone.utc)
            + timedelta(
                minutes=ENROLLMENT_CODE_EXPIRE_MINUTES
            )
        ),
    )

    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)

    return enrollment, enrollment_code


def consume_enrollment_token(
    db: Session,
    enrollment_code: str,
    device_id: str,
) -> DeviceEnrollmentToken | None:
    """
    Validate and consume an enrollment code atomically.

    The database row is locked while the code is validated and
    consumed, preventing two concurrent requests from using the
    same enrollment code.
    """

    normalized_code = normalize_enrollment_code(
        enrollment_code
    )

    enrollment = (
        db.query(DeviceEnrollmentToken)
        .filter(
            DeviceEnrollmentToken.token_hash
            == hash_enrollment_code(normalized_code)
        )
        .with_for_update()
        .first()
    )

    if enrollment is None:
        return None

    now = datetime.now(timezone.utc)

    if enrollment.used_at is not None:
        return None

    if enrollment.expires_at <= now:
        return None

    enrollment.used_at = now
    enrollment.device_id = device_id

    db.flush()

    return enrollment