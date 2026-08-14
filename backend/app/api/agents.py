from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.agent import Agent
from app.schemas.agent import AgentRegisterRequest, AgentResponse


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
        .filter(Agent.device_id == agent_data.device_id)
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
):
    agents = db.query(Agent).all()
    return agents

@router.post("/{device_id}/heartbeat")
def agent_heartbeat(
    device_id: str,
    db: Session = Depends(get_db),
):
    agent = (
        db.query(Agent)
        .filter(Agent.device_id == device_id)
        .first()
    )

    if not agent:
        return {
            "status": "error",
            "message": "Agent not found",
        }

    agent.last_seen = datetime.now(timezone.utc)

    db.commit()
    db.refresh(agent)

    return {
        "status": "online",
        "device_id": agent.device_id,
        "last_seen": agent.last_seen,
    }