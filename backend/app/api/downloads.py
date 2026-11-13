from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.api.auth import get_current_user
from app.models.user import User


router = APIRouter(
    prefix="/api/v1/downloads",
    tags=["Downloads"],
)

INSTALLER_NAME = "TechAIPILOTAgentSetup.exe"

INSTALLER_PATH = (
    Path(__file__).resolve().parent.parent
    / "static"
    / "downloads"
    / INSTALLER_NAME
)


@router.get("/agent-installer")
def download_agent_installer(
    current_user: User = Depends(get_current_user),
):
    """Agent installer, for signed-in technicians only."""

    if not INSTALLER_PATH.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The agent installer has not been uploaded to the server yet.",
        )

    return FileResponse(
        INSTALLER_PATH,
        media_type="application/octet-stream",
        filename=INSTALLER_NAME,
        headers={"Cache-Control": "no-store"},
    )
