from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AgentRegisterRequest(BaseModel):
    device_id: str
    hostname: str
    operating_system: str
    os_version: str
    agent_version: str


class AgentResponse(AgentRegisterRequest):
    id: int
    user_id: int | None
    organization_id: int | None
    registered_at: datetime
    display_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AgentRenameRequest(BaseModel):
    # Empty or null clears the name and shows the hostname again.
    display_name: str | None = Field(default=None, max_length=100)
