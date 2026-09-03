import os
from pathlib import Path
import uuid


APP_NAME = "TechAIPILOT"


DEFAULT_DATA_DIR = (
    Path(os.getenv("PROGRAMDATA", r"C:\ProgramData"))
    / APP_NAME
    / "data"
)


CONFIGURED_DATA_DIR = os.getenv(
    "TECHAIPILOT_DATA_DIR",
    "",
).strip()


DATA_DIR = (
    Path(CONFIGURED_DATA_DIR)
    if CONFIGURED_DATA_DIR
    else DEFAULT_DATA_DIR
)


DEVICE_ID_FILE = DATA_DIR / "device_id"


def get_device_id() -> str:
    """
    Return the persistent TechAIPILOT device ID.

    A new UUID is generated only when this machine
    runs the agent for the first time.

    The device ID is stored outside the application
    directory so replacing or updating the agent
    executable does not change the device identity.
    """

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    if DEVICE_ID_FILE.exists():
        device_id = DEVICE_ID_FILE.read_text(
            encoding="utf-8"
        ).strip()

        if device_id:
            return device_id

    device_id = f"TP-{uuid.uuid4().hex[:12].upper()}"

    DEVICE_ID_FILE.write_text(
        device_id,
        encoding="utf-8",
    )

    return device_id