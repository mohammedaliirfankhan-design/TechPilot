import json
import subprocess


FIREWALL_PROFILES = (
    "Domain",
    "Private",
    "Public",
)


def collect_firewall_posture() -> dict:
    """
    Collect Windows Defender Firewall profile state.

    This function is read-only. It does not modify firewall settings.
    """

    command = [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        (
            "Get-NetFirewallProfile "
            "| Select-Object Name,Enabled "
            "| ConvertTo-Json -Compress"
        ),
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )

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
                profiles[name.lower()] = {
                    "enabled": bool(enabled),
                }

        return {
            "available": True,
            "profiles": profiles,
        }

    except subprocess.TimeoutExpired:
        return {
            "available": False,
            "profiles": {},
            "error": "Firewall query timed out.",
        }

    except subprocess.CalledProcessError as exc:
        error = exc.stderr.strip() or "Firewall query failed."

        return {
            "available": False,
            "profiles": {},
            "error": error,
        }

    except (json.JSONDecodeError, OSError) as exc:
        return {
            "available": False,
            "profiles": {},
            "error": str(exc),
        }