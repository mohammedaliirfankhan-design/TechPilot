from typing import Any


def detect_firewall_disabled(
    firewall_data: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Detect disabled Windows Firewall profiles.

    The detector consumes the firewall payload produced by the
    network collector:

        {
            "available": True,
            "profiles": {
                "domain": {"enabled": True},
                "private": {"enabled": False},
                "public": {"enabled": True},
            }
        }

    Returns alert definitions compatible with the existing Alert model.
    """

    profiles = firewall_data.get("profiles", {})

    if not isinstance(profiles, dict):
        return []

    profile_mapping = {
        "domain": "DOMAIN",
        "private": "PRIVATE",
        "public": "PUBLIC",
    }

    disabled_profiles: list[str] = []

    for profile_key, profile_name in profile_mapping.items():
        profile = profiles.get(profile_key)

        if not isinstance(profile, dict):
            continue

        if profile.get("enabled") is False:
            disabled_profiles.append(profile_name)

    if not disabled_profiles:
        return []

    disabled_count = len(disabled_profiles)
    profile_text = ", ".join(disabled_profiles)

    return [
        {
            "alert_type": "NETWORK_FIREWALL_DISABLED",
            "severity": "CRITICAL",
            "message": (
                f"Windows Firewall profile(s) disabled: "
                f"{profile_text}"
            ),
            "metric_value": float(disabled_count),
            "threshold": 0.0,
        }
    ]