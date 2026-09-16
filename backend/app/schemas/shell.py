from datetime import datetime

from pydantic import BaseModel, Field


class ShellSessionCreateRequest(BaseModel):
    device_id: str = Field(
        min_length=1,
        max_length=128,
    )
    shell_type: str = Field(
        default="POWERSHELL",
        min_length=1,
        max_length=20,
    )


class ShellSessionResponse(BaseModel):
    session_id: int
    device_id: str
    shell_type: str
    status: str
    started_at: datetime
    ended_at: datetime | None = None


class ShellCommandCreateRequest(BaseModel):
    command: str = Field(
        min_length=1,
        max_length=8192,
    )


class ShellCommandResponse(BaseModel):
    command_id: int
    session_id: int
    command: str
    status: str
    stdout: str | None = None
    stderr: str | None = None
    exit_code: int | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None