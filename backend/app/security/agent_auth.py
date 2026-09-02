import hashlib
import secrets

from fastapi import (
    Depends,
    Header,
    HTTPException,
    WebSocket,
    status,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.agent import Agent


AGENT_TOKEN_PREFIX = "tpa_"


def generate_agent_token() -> str:
    return f"{AGENT_TOKEN_PREFIX}{secrets.token_urlsafe(48)}"


def hash_agent_token(token: str) -> str:
    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def verify_agent_token(
    token: str,
    token_hash: str,
) -> bool:

    if not token or not token_hash:
        return False

    expected_hash = hash_agent_token(
        token
    )

    return secrets.compare_digest(
        expected_hash,
        token_hash,
    )


def get_current_agent(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Agent:

    if not authorization:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Agent authorization required.",
        )

    scheme, _, token = authorization.partition(" ")

    if (
        scheme.lower() != "bearer"
        or not token
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid agent authorization header.",
        )

    if not token.startswith(
        AGENT_TOKEN_PREFIX
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid agent credential.",
        )

    token_hash = hash_agent_token(
        token
    )

    agent = (
        db.query(Agent)
        .filter(
            Agent.agent_token_hash
            == token_hash
        )
        .first()
    )

    if not agent:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid agent credential.",
        )

    return agent


def authenticate_agent_websocket(
    websocket: WebSocket,
    db: Session,
) -> Agent | None:

    token = websocket.query_params.get(
        "token"
    )

    if not token:
        return None

    if not token.startswith(
        AGENT_TOKEN_PREFIX
    ):
        return None

    token_hash = hash_agent_token(
        token
    )

    agent = (
        db.query(Agent)
        .filter(
            Agent.agent_token_hash
            == token_hash
        )
        .first()
    )

    if not agent:
        return None

    return agent