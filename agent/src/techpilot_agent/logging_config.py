import logging
import os
from pathlib import Path


APP_NAME = "TechAIPILOT"

DEFAULT_LOG_DIR = (
    Path(os.getenv("PROGRAMDATA", r"C:\ProgramData"))
    / APP_NAME
    / "logs"
)

CONFIGURED_LOG_DIR = os.getenv(
    "TECHAIPILOT_LOG_DIR",
    "",
).strip()

LOG_DIR = (
    Path(CONFIGURED_LOG_DIR)
    if CONFIGURED_LOG_DIR
    else DEFAULT_LOG_DIR
)

LOG_FILE = LOG_DIR / "agent.log"


def configure_logging() -> logging.Logger:
    """
    Configure application logging for the TechAIPILOT agent.

    The log directory is configurable through
    TECHAIPILOT_LOG_DIR.

    By default, packaged Windows installations use:

        C:\\ProgramData\\TechAIPILOT\\logs\\agent.log
    """

    LOG_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    logger = logging.getLogger(APP_NAME)

    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(threadName)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.FileHandler(
        LOG_FILE,
        encoding="utf-8",
    )

    file_handler.setFormatter(formatter)

    logger.addHandler(file_handler)

    return logger