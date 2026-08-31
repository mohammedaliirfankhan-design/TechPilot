from datetime import datetime, timedelta, timezone
import os

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError


password_hasher = PasswordHasher()

JWT_ALGORITHM = "HS256"

JWT_SECRET_KEY = os.getenv(
    "TECHPILOT_JWT_SECRET",
    "",
)

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv(
        "TECHPILOT_ACCESS_TOKEN_EXPIRE_MINUTES",
        "60",
    )
)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(
    password: str,
    password_hash: str,
) -> bool:

    try:
        return password_hasher.verify(
            password_hash,
            password,
        )

    except VerifyMismatchError:
        return False


def create_access_token(
    user_id: int,
) -> str:

    if not JWT_SECRET_KEY:
        raise RuntimeError(
            "TECHPILOT_JWT_SECRET is not configured."
        )

    now = datetime.now(timezone.utc)

    expires_at = (
        now
        + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
        )
    )

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(
    token: str,
) -> int | None:

    if not JWT_SECRET_KEY:
        raise RuntimeError(
            "TECHPILOT_JWT_SECRET is not configured."
        )

    try:

        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        subject = payload.get("sub")

        if not subject:
            return None

        return int(subject)

    except (
        jwt.InvalidTokenError,
        ValueError,
    ):
        return None