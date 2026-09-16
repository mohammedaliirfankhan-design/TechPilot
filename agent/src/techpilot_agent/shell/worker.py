from __future__ import annotations

import logging
import threading
import time

from techpilot_agent.communication.client import TechPilotClient
from techpilot_agent.shell.executor import execute_command


logger = logging.getLogger(__name__)


SHELL_POLL_INTERVAL = 2
SHELL_STATUS_INTERVAL = 2


class ShellWorker:
    """
    Independent Agent worker for authorized CMD / PowerShell sessions.

    This worker is deliberately separate from the remote desktop
    session lifecycle.
    """

    def __init__(
        self,
        client: TechPilotClient,
        device_id: str,
    ):
        self.client = client
        self.device_id = device_id

        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

        self._active_session_id: int | None = None

    def start(self) -> None:
        if (
            self._thread is not None
            and self._thread.is_alive()
        ):
            return

        self._stop_event.clear()

        self._thread = threading.Thread(
            target=self.run,
            daemon=True,
            name="shell-worker",
        )

        self._thread.start()

        logger.info(
            "Shell worker started for device %s.",
            self.device_id,
        )

    def stop(self) -> None:
        self._stop_event.set()

        if self._thread is not None:
            self._thread.join(timeout=2)

        logger.info(
            "Shell worker stopped for device %s.",
            self.device_id,
        )

    def run(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._run_cycle()

            except Exception:
                logger.exception(
                    "Unexpected shell worker error."
                )

            self._stop_event.wait(
                SHELL_POLL_INTERVAL
            )

    def _run_cycle(self) -> None:
        # ------------------------------------------------------
        # No active shell session:
        # look for a newly requested session.
        # ------------------------------------------------------

        if self._active_session_id is None:
            self._discover_session()
            return

        # ------------------------------------------------------
        # Existing shell session:
        # first make sure the administrator has not closed it.
        # ------------------------------------------------------

        session_status = (
            self.client.get_shell_session_status(
                self._active_session_id
            )
        )

        status = session_status.get("status")

        if status != "ACTIVE":
            logger.info(
                "Shell session %s is no longer active "
                "(status=%s).",
                self._active_session_id,
                status,
            )

            self._active_session_id = None
            return

        # ------------------------------------------------------
        # Look for the next queued command.
        # ------------------------------------------------------

        pending_command = (
            self.client.get_pending_shell_command(
                self._active_session_id
            )
        )

        command_data = pending_command.get(
            "command"
        )

        if not command_data:
            return

        self._execute_pending_command(
            command_data
        )

    def _discover_session(self) -> None:
        response = (
            self.client.get_pending_shell_session(
                self.device_id
            )
        )

        session = response.get("session")

        if not session:
            return

        session_id = session.get("session_id")

        if session_id is None:
            logger.warning(
                "Received shell session without session_id."
            )
            return

        logger.info(
            "New shell session detected: %s.",
            session_id,
        )

        accepted = (
            self.client.accept_shell_session(
                session_id
            )
        )

        accepted_status = accepted.get(
            "status"
        )

        if accepted_status != "ACTIVE":
            logger.warning(
                "Shell session %s was not activated. "
                "Status=%s",
                session_id,
                accepted_status,
            )
            return

        self._active_session_id = session_id

        logger.info(
            "Shell session %s is now ACTIVE.",
            session_id,
        )

    def _execute_pending_command(
        self,
        command_data: dict,
    ) -> None:
        command_id = command_data.get(
            "command_id"
        )

        command = command_data.get(
            "command"
        )

        if command_id is None or command is None:
            logger.warning(
                "Received invalid shell command payload."
            )
            return

        session_id = self._active_session_id

        if session_id is None:
            return

        # The backend supplies the shell type through
        # the session, so retrieve the current session state.
        session_status = (
            self.client.get_shell_session_status(
                session_id
            )
        )

        shell_type = session_status.get(
            "shell_type"
        )

        if shell_type not in {
            "POWERSHELL",
            "CMD",
        }:
            logger.error(
                "Shell session %s has unsupported shell type: %s",
                session_id,
                shell_type,
            )

            self._submit_result(
                command_id,
                {
                    "stdout": "",
                    "stderr": (
                        "Unsupported shell type."
                    ),
                    "exit_code": None,
                    "timed_out": False,
                },
            )

            return

        logger.info(
            "Executing shell command %s "
            "for session %s using %s.",
            command_id,
            session_id,
            shell_type,
        )

        try:
            result = execute_command(
                shell_type=shell_type,
                command=command,
            )

            result_payload = {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.exit_code,
                "timed_out": result.timed_out,
            }

        except Exception as exc:
            logger.exception(
                "Shell command %s execution failed.",
                command_id,
            )

            result_payload = {
                "stdout": "",
                "stderr": (
                    f"Agent execution error: "
                    f"{type(exc).__name__}: {exc}"
                ),
                "exit_code": None,
                "timed_out": False,
            }

        self._submit_result(
            command_id,
            result_payload,
        )

    def _submit_result(
        self,
        command_id: int,
        result: dict,
    ) -> None:
        try:
            response = (
                self.client.submit_shell_command_result(
                    command_id,
                    result,
                )
            )

            logger.info(
                "Shell command %s result submitted. "
                "Status=%s",
                command_id,
                response.get("status"),
            )

        except Exception:
            logger.exception(
                "Failed to submit result for "
                "shell command %s.",
                command_id,
            )