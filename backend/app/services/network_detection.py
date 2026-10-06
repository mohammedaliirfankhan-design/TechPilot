from typing import Any


def detect_firewall_disabled(
    firewall_data: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Detect disabled Windows Firewall profiles.

    The detector consumes the firewall payload produced by the
    network collector.

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


def _is_loopback_address(bind_address: str | None) -> bool:
    """
    Return True when a listener is bound only to localhost.
    """

    if not bind_address:
        return False

    normalized = bind_address.strip().lower()

    return normalized in {
        "127.0.0.1",
        "::1",
        "localhost",
    }


def _listener_key(listener: dict[str, Any]) -> tuple:
    """
    Build a stable identity for a network listener.

    Process name is included so a port changing ownership between
    processes is treated as a meaningful listener change.
    """

    return (
        str(listener.get("protocol") or "").upper(),
        str(listener.get("bind_address") or "").lower(),
        int(listener.get("port") or 0),
        str(listener.get("process_name") or "").lower(),
    )


def detect_unexpected_listeners(
    current_listeners: list[dict[str, Any]],
    previous_listeners: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Detect newly observed externally bound TCP/UDP listeners.

    The first snapshot establishes the baseline and produces no alerts.

    Loopback listeners are ignored because they are not externally
    reachable through the network interface.

    A listener is considered new when its protocol, bind address,
    port, or process identity was not present in the previous snapshot.

    Returns alert definitions compatible with the existing Alert model.
    """

    if not isinstance(current_listeners, list):
        return []

    if not isinstance(previous_listeners, list):
        previous_listeners = []

    # No previous snapshot means there is no baseline yet.
    if not previous_listeners:
        return []

    previous_keys = {
        _listener_key(listener)
        for listener in previous_listeners
        if isinstance(listener, dict)
    }

    new_listeners: list[dict[str, Any]] = []

    for listener in current_listeners:
        if not isinstance(listener, dict):
            continue

        bind_address = listener.get("bind_address")

        if _is_loopback_address(bind_address):
            continue

        key = _listener_key(listener)

        if key in previous_keys:
            continue

        new_listeners.append(listener)

    if not new_listeners:
        return []

    alert_definitions: list[dict[str, Any]] = []

    for listener in new_listeners:
        protocol = str(
            listener.get("protocol") or "UNKNOWN"
        ).upper()

        bind_address = str(
            listener.get("bind_address") or "UNKNOWN"
        )

        port = int(listener.get("port") or 0)

        process_name = listener.get("process_name")

        if process_name:
            description = (
                f"{protocol} listener {bind_address}:{port} "
                f"opened by {process_name}"
            )
        else:
            description = (
                f"{protocol} listener {bind_address}:{port} "
                f"opened by an unknown process"
            )

        alert_definitions.append(
            {
                "alert_type": "NETWORK_UNEXPECTED_LISTENER",
                "severity": "HIGH",
                "message": (
                    f"Unexpected network listener detected: "
                    f"{description}"
                ),
                "metric_value": float(port),
                "threshold": 0.0,
            }
        )

    return alert_definitions