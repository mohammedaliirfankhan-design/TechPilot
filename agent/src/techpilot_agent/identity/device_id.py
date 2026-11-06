
import os
from datetime import datetime
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


def generate_device_id() -> str:
    """Generate a new device identity without changing the stored identity."""
    return f"TP-{uuid.uuid4().hex[:12].upper()}"


def save_device_id(device_id: str) -> None:
    """
    Persist a device identity.

    If a different identity already exists, preserve it in a timestamped
    backup before replacing it.
    """
    device_id = device_id.strip()

    if not device_id:
        raise ValueError("Device ID cannot be empty.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if DEVICE_ID_FILE.exists():
        previous_id = DEVICE_ID_FILE.read_text(
            encoding="utf-8"
        ).strip()

        if previous_id and previous_id != device_id:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = DATA_DIR / f"device_id.backup_{timestamp}"

            # Preserve the old identity before replacing it.
            backup_file.write_text(
                previous_id,
                encoding="utf-8",
            )

    temporary_file = DATA_DIR / "device_id.tmp"

    temporary_file.write_text(
        device_id,
        encoding="utf-8",
    )

    temporary_file.replace(DEVICE_ID_FILE)


def get_device_id() -> str:
    """
    Return the persistent device ID.

    Generate and save one only if no valid identity exists.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if DEVICE_ID_FILE.exists():
        device_id = DEVICE_ID_FILE.read_text(
            encoding="utf-8"
        ).strip()

        if device_id:
            return device_id

    device_id = generate_device_id()
    save_device_id(device_id)

    return device_id
