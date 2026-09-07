from datetime import datetime

from pydantic import BaseModel


class DeviceEnrollmentCreateResponse(BaseModel):
    status: str
    enrollment_code: str
    expires_at: datetime
    message: str


class DeviceEnrollmentCompleteRequest(BaseModel):
    enrollment_code: str
    device_id: str
    hostname: str
    operating_system: str
    os_version: str
    agent_version: str


class DeviceEnrollmentCompleteResponse(BaseModel):
    status: str
    device_id: str
    agent_token: str
    message: str