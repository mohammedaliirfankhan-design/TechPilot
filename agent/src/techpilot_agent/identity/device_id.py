from pathlib import Path
import uuid


DATA_DIR = Path(__file__).resolve().parents[3] / "data"
DEVICE_ID_FILE = DATA_DIR / "device_id"


def get_device_id() -> str:
    """
    Return the persistent TechPilot device ID.

    A new UUID is generated only when this machine
    runs the agent for the first time.
    """

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if DEVICE_ID_FILE.exists():
        device_id = DEVICE_ID_FILE.read_text(encoding="utf-8").strip()

        if device_id:
            return device_id

    device_id = f"TP-{uuid.uuid4().hex[:12].upper()}"

    DEVICE_ID_FILE.write_text(
        device_id,
        encoding="utf-8",
    )

    return device_id