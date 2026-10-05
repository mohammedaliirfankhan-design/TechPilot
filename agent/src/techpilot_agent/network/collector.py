import socket

import psutil


def _safe_process_name(pid: int | None) -> str | None:
    if pid is None:
        return None

    try:
        return psutil.Process(pid).name()
    except (
        psutil.NoSuchProcess,
        psutil.AccessDenied,
        psutil.ZombieProcess,
    ):
        return None


def collect_network_interfaces() -> list[dict]:
    """
    Collect network interface and address information.
    """

    interfaces = []

    addresses = psutil.net_if_addrs()
    stats = psutil.net_if_stats()

    for interface_name, interface_addresses in addresses.items():
        interface_stat = stats.get(interface_name)

        is_up = None
        speed_mbps = None

        if interface_stat is not None:
            is_up = interface_stat.isup
            speed_mbps = interface_stat.speed

        mac_address = None
        address_entries = []

        for address in interface_addresses:
            if address.family == psutil.AF_LINK:
                mac_address = address.address
                continue

            if address.family in (
                socket.AF_INET,
                socket.AF_INET6,
            ):
                address_entries.append(
                    {
                        "family": (
                            "IPv4"
                            if address.family == socket.AF_INET
                            else "IPv6"
                        ),
                        "address": address.address,
                        "netmask": address.netmask,
                    }
                )

        interfaces.append(
            {
                "interface_name": interface_name,
                "mac_address": mac_address,
                "is_up": is_up,
                "speed_mbps": speed_mbps,
                "addresses": address_entries,
            }
        )

    return interfaces


def _get_protocol(connection) -> str | None:
    if connection.type == socket.SOCK_STREAM:
        return "TCP"

    if connection.type == socket.SOCK_DGRAM:
        return "UDP"

    return None


def collect_network_connections() -> list[dict]:
    """
    Collect active network connections.

    Process information is best-effort because Windows may
    deny access to some processes.
    """

    connections = []

    for connection in psutil.net_connections(kind="inet"):
        protocol = _get_protocol(connection)

        if protocol is None:
            continue

        local_address = None
        remote_address = None

        if connection.laddr:
            local_address = {
                "address": connection.laddr.ip,
                "port": connection.laddr.port,
            }

        if connection.raddr:
            remote_address = {
                "address": connection.raddr.ip,
                "port": connection.raddr.port,
            }

        connections.append(
            {
                "protocol": protocol,
                "local_address": local_address,
                "remote_address": remote_address,
                "status": connection.status,
                "pid": connection.pid,
                "process_name": _safe_process_name(connection.pid),
            }
        )

    return connections


def collect_tcp_listeners() -> list[dict]:
    """
    Collect TCP sockets that are actively listening.
    """

    listeners = []

    for connection in psutil.net_connections(kind="tcp"):
        if connection.status != psutil.CONN_LISTEN:
            continue

        if not connection.laddr:
            continue

        listeners.append(
            {
                "protocol": "TCP",
                "bind_address": connection.laddr.ip,
                "port": connection.laddr.port,
                "pid": connection.pid,
                "process_name": _safe_process_name(connection.pid),
            }
        )

    return listeners


def collect_udp_bindings() -> list[dict]:
    """
    Collect UDP sockets with a local bind address.

    UDP has no TCP-style LISTEN state, so these are reported
    separately as bindings rather than listeners.
    """

    bindings = []

    for connection in psutil.net_connections(kind="udp"):
        if not connection.laddr:
            continue

        bindings.append(
            {
                "protocol": "UDP",
                "bind_address": connection.laddr.ip,
                "port": connection.laddr.port,
                "pid": connection.pid,
                "process_name": _safe_process_name(connection.pid),
            }
        )

    return bindings


def collect_network_telemetry() -> dict:
    """
    Collect a read-only network visibility snapshot.
    """

    return {
        "interfaces": collect_network_interfaces(),
        "connections": collect_network_connections(),
        "tcp_listeners": collect_tcp_listeners(),
        "udp_bindings": collect_udp_bindings(),
    }