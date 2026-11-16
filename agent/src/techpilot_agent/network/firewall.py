"""
Windows Firewall posture (read-only).

Primary method: `netsh advfirewall show allprofiles state`
  - built into Windows, answers in well under a second
  - no PowerShell start-up cost

Fallback: PowerShell Get-NetFirewallProfile, with a longer timeout,
used only if netsh output can't be parsed (for example on a
non-English Windows where the labels are translated).

Nothing in this module changes firewall settings.
"""

import json
import re
import subprocess


FIREWALL_PROFILES = (
    "Domain",
    "Private",
    "Public",
)

NETSH_TIMEOUT_SECONDS = 15
POWERSHELL_TIMEOUT_SECONDS = 45

# Hide the console window that would otherwise flash up when the
# agent is built as a windowed (no-console) executable.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _run(command: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        errors="replace",
        timeout=timeout,
        check=True,
        creationflags=_NO_WINDOW,
    )


# ---------------------------------------------------------
# netsh (fast path)
# ---------------------------------------------------------

_PROFILE_HEADER = re.compile(
    r"^\s*(Domain|Private|Public)\s+Profile",
    re.IGNORECASE,
)

_STATE_LINE = re.compile(
    r"^\s*State\s+(ON|OFF)\s*$",
    re.IGNORECASE,
)


def _parse_netsh(output: str) -> dict:
    profiles: dict = {}
    current: str | None = None

    for line in output.splitlines():
        header = _PROFILE_HEADER.match(line)
        if header:
            current = header.group(1).lower()
            continue

        state = _STATE_LINE.match(line)
        if state and current:
            profiles[current] = {
                "enabled": state.group(1).upper() == "ON",
            }
            current = None

    return profiles


def _collect_with_netsh() -> dict | None:
    try:
        result = _run(
            ["netsh", "advfirewall", "show", "allprofiles", "state"],
            NETSH_TIMEOUT_SECONDS,
        )
    except (subprocess.SubprocessError, OSError):
        return None

    profiles = _parse_netsh(result.stdout)

    # Only trust it if all three profiles were understood.
    if len(profiles) != 3:
        return None

    return {
        "available": True,
        "profiles": profiles,
        "method": "netsh",
    }


# ---------------------------------------------------------
# PowerShell (fallback)
# ---------------------------------------------------------

def _collect_with_powershell() -> dict:
    command = [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        (
            "Get-NetFirewallProfile "
            "| Select-Object Name,Enabled "
            "| ConvertTo-Json -Compress"
        ),
    ]

    try:
        result = _run(command, POWERSHELL_TIMEOUT_SECONDS)

        raw_output = result.stdout.strip()

        if not raw_output:
            return {
                "available": False,
                "profiles": {},
                "error": "No firewall profile data returned.",
            }

        data = json.loads(raw_output)

        if isinstance(data, dict):
            data = [data]

        profiles = {}

        for profile in data:
            name = profile.get("Name")
            enabled = profile.get("Enabled")

            if name in FIREWALL_PROFILES:
                # Enabled can come back as True/False or 1/0.
                profiles[name.lower()] = {
                    "enabled": bool(enabled),
                }

        return {
            "available": bool(profiles),
            "profiles": profiles,
            "method": "powershell",
        }

    except subprocess.TimeoutExpired:
        return {
            "available": False,
            "profiles": {},
            "error": "Firewall query timed out.",
        }

    except subprocess.CalledProcessError as exc:
        error = (exc.stderr or "").strip() or "Firewall query failed."

        return {
            "available": False,
            "profiles": {},
            "error": error[:500],
        }

    except (json.JSONDecodeError, OSError) as exc:
        return {
            "available": False,
            "profiles": {},
            "error": str(exc)[:500],
        }


def collect_firewall_posture() -> dict:
    """
    Collect Windows Defender Firewall profile state.
    """

    return _collect_with_netsh() or _collect_with_powershell()
