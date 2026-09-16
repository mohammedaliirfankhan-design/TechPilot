from __future__ import annotations

import subprocess
from dataclasses import dataclass


DEFAULT_TIMEOUT_SECONDS = 60
MAX_OUTPUT_CHARS = 64 * 1024


@dataclass
class ShellExecutionResult:
    stdout: str
    stderr: str
    exit_code: int | None
    timed_out: bool


def _truncate_output(value: str) -> str:
    if len(value) <= MAX_OUTPUT_CHARS:
        return value

    return value[:MAX_OUTPUT_CHARS] + (
        "\n\n[Output truncated by TechAIPILOT Agent.]"
    )


def _terminate_process_tree(process: subprocess.Popen) -> None:
    """
    Terminate the shell process and any child processes it created.

    This is particularly important on Windows because commands such as:

        powershell.exe -> ping.exe

    can leave child processes alive after the parent shell is terminated.
    """

    if process.poll() is not None:
        return

    try:
        subprocess.run(
            [
                "taskkill",
                "/PID",
                str(process.pid),
                "/T",
                "/F",
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except Exception:
        # Fall back to terminating the parent process if taskkill itself
        # cannot be executed.
        try:
            process.kill()
        except Exception:
            pass


def execute_command(
    shell_type: str,
    command: str,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> ShellExecutionResult:
    normalized_shell_type = shell_type.strip().upper()

    if not command.strip():
        raise ValueError("Command cannot be empty.")

    if normalized_shell_type == "POWERSHELL":
        executable = "powershell.exe"
        arguments = [
            executable,
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            command,
        ]

    elif normalized_shell_type == "CMD":
        executable = "cmd.exe"
        arguments = [
            executable,
            "/d",
            "/s",
            "/c",
            command,
        ]

    else:
        raise ValueError(
            f"Unsupported shell type: {normalized_shell_type}"
        )

    process = subprocess.Popen(
        arguments,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )

    try:
        stdout, stderr = process.communicate(
            timeout=timeout_seconds
        )

        return ShellExecutionResult(
            stdout=_truncate_output(stdout or ""),
            stderr=_truncate_output(stderr or ""),
            exit_code=process.returncode,
            timed_out=False,
        )

    except subprocess.TimeoutExpired as exc:
        # Capture anything already produced before termination.
        stdout = exc.stdout or ""
        stderr = exc.stderr or ""

        if isinstance(stdout, bytes):
            stdout = stdout.decode("utf-8", errors="replace")

        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", errors="replace")

        # Kill the entire process tree so child processes such as ping.exe
        # cannot keep stdout/stderr pipes open.
        _terminate_process_tree(process)

        # Collect any remaining output after the process tree has stopped.
        try:
            remaining_stdout, remaining_stderr = process.communicate(
                timeout=5
            )

            stdout += remaining_stdout or ""
            stderr += remaining_stderr or ""

        except subprocess.TimeoutExpired:
            # Final fallback. The process should normally already be gone
            # after taskkill /T /F.
            try:
                process.kill()
            except Exception:
                pass

            try:
                remaining_stdout, remaining_stderr = process.communicate(
                    timeout=2
                )

                stdout += remaining_stdout or ""
                stderr += remaining_stderr or ""

            except Exception:
                pass

        timeout_message = (
            "\n\n"
            "[Command timed out and was terminated by "
            "TechAIPILOT Agent.]"
        )

        return ShellExecutionResult(
            stdout=_truncate_output(stdout),
            stderr=_truncate_output(
                stderr + timeout_message
            ),
            exit_code=None,
            timed_out=True,
        )