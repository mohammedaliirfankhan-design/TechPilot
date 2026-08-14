from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AgentRegisterRequest(BaseModel):
    device_id: str
    hostname: str
    operating_system: str
    os_version: str
    agent_version: str


class AgentResponse(AgentRegisterRequest):
    id: int
    registered_at: datetime

    model_config = ConfigDict(from_attributes=True)