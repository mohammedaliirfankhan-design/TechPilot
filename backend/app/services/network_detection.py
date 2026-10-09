from typing import Any
import ipaddress

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

def detect_rdp_exposure(
    listeners: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Detect externally reachable Windows RDP listeners.

    RDP uses TCP port 3389.

    Loopback-only listeners are ignored because they are not
    externally reachable through the network.

    Returns alert definitions compatible with the existing Alert model.
    """

    if not isinstance(listeners, list):
        return []

    alerts: list[dict[str, Any]] = []

    for listener in listeners:
        if not isinstance(listener, dict):
            continue

        protocol = str(
            listener.get("protocol") or ""
        ).upper()

        if protocol != "TCP":
            continue

        port = int(listener.get("port") or 0)

        if port != 3389:
            continue

        bind_address = str(
            listener.get("bind_address") or ""
        ).strip()

        if _is_loopback_address(bind_address):
            continue

        process_name = listener.get("process_name")

        if process_name:
            message = (
                f"RDP exposure detected: "
                f"TCP {bind_address}:3389 "
                f"opened by {process_name}"
            )
        else:
            message = (
                f"RDP exposure detected: "
                f"TCP {bind_address}:3389 "
                f"opened by an unknown process"
            )

        alerts.append(
            {
                "alert_type": "NETWORK_RDP_EXPOSURE",
                "severity": "HIGH",
                "message": message,
                "metric_value": 3389.0,
                "threshold": 0.0,
            }
        )

    return alerts

def detect_port_scan(
    connections: list[dict[str, Any]],
    port_threshold: int = 20,
) -> list[dict[str, Any]]:
    """
    Detect possible TCP port scanning against a single remote host.

    A scan is detected when one source device has TCP connections
    to at least `port_threshold` distinct remote ports on the same
    remote IP within the current telemetry snapshot.

    Connections without a remote address/port are ignored.

    Loopback traffic is ignored.

    Returns alert definitions compatible with the existing Alert model.
    """

    if not isinstance(connections, list):
        return []

    targets: dict[str, set[int]] = {}

    for connection in connections:
        if not isinstance(connection, dict):
            continue

        protocol = str(
            connection.get("protocol") or ""
        ).upper()

        if protocol != "TCP":
            continue

        remote_address = connection.get("remote_address")
        remote_port = connection.get("remote_port")

        if not remote_address or remote_port is None:
            continue

        remote_address = str(remote_address).strip()

        if remote_address in {
            "127.0.0.1",
            "::1",
            "localhost",
        }:
            continue

        try:
            remote_port = int(remote_port)
        except (TypeError, ValueError):
            continue

        if not 1 <= remote_port <= 65535:
            continue

        targets.setdefault(remote_address, set()).add(remote_port)

    scan_targets = [
        (remote_address, ports)
        for remote_address, ports in targets.items()
        if len(ports) >= port_threshold
    ]

    if not scan_targets:
        return []

    alerts: list[dict[str, Any]] = []

    for remote_address, ports in scan_targets:
        alerts.append(
            {
                "alert_type": "NETWORK_PORT_SCAN",
                "severity": "HIGH",
                "message": (
                    f"Possible TCP port scan detected against "
                    f"{remote_address}: "
                    f"{len(ports)} distinct remote ports contacted"
                ),
                "metric_value": float(len(ports)),
                "threshold": float(port_threshold),
            }
        )

    return alerts


def detect_suspicious_outbound(
    connections: list[dict[str, Any]],
    suspicious_ports: set[int] | None = None,
) -> list[dict[str, Any]]:
    """
    Flag established TCP connections to public IP addresses on
    configured suspicious destination ports.

    This is a heuristic for SOC investigation, not proof of compromise.
    """

    if not isinstance(connections, list):
        return []

    if suspicious_ports is None:
        suspicious_ports = {
            1337,
            4444,
            5555,
            6667,
            31337,
        }

    alerts: list[dict[str, Any]] = []
    observed: set[tuple[str, int, str]] = set()

    for connection in connections:
        if not isinstance(connection, dict):
            continue

        if str(connection.get("protocol") or "").upper() != "TCP":
            continue

        if str(connection.get("status") or "").upper() != "ESTABLISHED":
            continue

        remote = connection.get("remote_address")
        remote_port = connection.get("remote_port")

        # Support both the collector's nested address format and
        # the flattened format used by existing detection logic.
        if isinstance(remote, dict):
            remote_port = (
                remote.get("port")
                if remote_port is None
                else remote_port
            )
            remote = remote.get("address")

        if not remote or remote_port is None:
            continue

        try:
            remote_ip = ipaddress.ip_address(str(remote).strip())
            port = int(remote_port)
        except (ValueError, TypeError):
            continue

        if not remote_ip.is_global:
            continue

        if port not in suspicious_ports:
            continue

        process_name = str(
            connection.get("process_name") or "unknown process"
        )
        key = (str(remote_ip), port, process_name.lower())

        if key in observed:
            continue

        observed.add(key)

        alerts.append(
            {
                "alert_type": "NETWORK_SUSPICIOUS_OUTBOUND",
                "severity": "HIGH",
                "message": (
                    "Suspicious outbound connection detected: "
                    f"TCP to {remote_ip}:{port} "
                    f"from {process_name}"
                ),
                "metric_value": float(port),
                "threshold": 0.0,
            }
        )

    return alerts
