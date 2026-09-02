import os


BACKEND_URL = os.getenv(
    "TECHAIPILOT_BACKEND_URL",
    "",
).rstrip("/")

AGENT_TOKEN = os.getenv(
    "TECHAIPILOT_AGENT_TOKEN",
    "",
)


if not BACKEND_URL:
    raise RuntimeError(
        "TECHAIPILOT_BACKEND_URL is not configured."
    )


if not AGENT_TOKEN:
    raise RuntimeError(
        "TECHAIPILOT_AGENT_TOKEN is not configured."
    )