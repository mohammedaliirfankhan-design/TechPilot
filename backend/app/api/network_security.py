from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.agent import Agent
from app.models.alert import Alert
from app.models.firewall_posture import FirewallPosture
from app.models.network_connection import NetworkConnection
from app.models.network_interface import NetworkInterface
from app.models.network_listener import NetworkListener
from app.models.network_snapshot import NetworkSnapshot
from app.models.user import User
from app.security.agent_auth import get_current_agent
from app.services.network_detection import (
    detect_firewall_disabled,
    detect_port_scan,
    detect_rdp_exposure,
    detect_unexpected_listeners,
)
from app.services.network_detection import (
    detect_firewall_disabled,
    detect_port_scan,
    detect_rdp_exposure,
    detect_suspicious_outbound,
    detect_unexpected_listeners,
)
from app.services.organization import get_user_default_organization


router = APIRouter(
    prefix="/api/v1/security/network",
    tags=["Network Security"],
)


def _require_agent_organization(current_agent: Agent) -> int:
    if current_agent.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent is not assigned to an organization.",
        )

    return current_agent.organization_id


def _require_user_organization(
    db: Session,
    current_user: User,
):
    organization = get_user_default_organization(
        db,
        current_user,
    )

    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account must belong to exactly one active "
                "organization to access network security data."
            ),
        )

    return organization


@router.post("/telemetry")
def receive_network_telemetry(
    network_data: dict,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    organization_id = _require_agent_organization(current_agent)

    interfaces = network_data.get("interfaces", [])
    connections = network_data.get("connections", [])
    tcp_listeners = network_data.get("tcp_listeners", [])
    udp_bindings = network_data.get("udp_bindings", [])
    firewall = network_data.get("firewall", {})

    if not isinstance(interfaces, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="interfaces must be a list.",
        )

    if not isinstance(connections, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="connections must be a list.",
        )

    if not isinstance(tcp_listeners, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="tcp_listeners must be a list.",
        )

    if not isinstance(udp_bindings, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="udp_bindings must be a list.",
        )

    if not isinstance(firewall, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="firewall must be an object.",
        )

    previous_snapshot = (
        db.query(NetworkSnapshot)
        .filter(
            NetworkSnapshot.device_id == current_agent.device_id,
            NetworkSnapshot.organization_id == organization_id,
        )
        .order_by(
            NetworkSnapshot.collected_at.desc(),
        )
        .first()
    )

    previous_listeners: list[dict] = []

    if previous_snapshot is not None:
        previous_listeners = [
            {
                "protocol": listener.protocol,
                "bind_address": listener.bind_address,
                "port": listener.port,
                "pid": listener.pid,
                "process_name": listener.process_name,
            }
            for listener in previous_snapshot.listeners
        ]

    snapshot = NetworkSnapshot(
        device_id=current_agent.device_id,
        organization_id=organization_id,
    )

    db.add(snapshot)
    db.flush()

    for interface in interfaces:
        if not isinstance(interface, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Each interface must be an object.",
            )

        db.add(
            NetworkInterface(
                snapshot_id=snapshot.id,
                interface_name=interface.get(
                    "interface_name",
                    "Unknown",
                ),
                mac_address=interface.get("mac_address"),
                is_up=interface.get("is_up"),
                speed_mbps=interface.get("speed_mbps"),
                addresses=interface.get("addresses"),
            )
        )

    for connection in connections:
        if not isinstance(connection, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Each connection must be an object.",
            )

        local_address = connection.get("local_address") or {}
        remote_address = connection.get("remote_address") or {}

        db.add(
            NetworkConnection(
                snapshot_id=snapshot.id,
                protocol=connection.get(
                    "protocol",
                    "UNKNOWN",
                ),
                local_address=local_address.get("address"),
                local_port=local_address.get("port"),
                remote_address=remote_address.get("address"),
                remote_port=remote_address.get("port"),
                status=connection.get("status"),
                pid=connection.get("pid"),
                process_name=connection.get("process_name"),
            )
        )

    listener_records = [
        *tcp_listeners,
        *udp_bindings,
    ]

    for listener in listener_records:
        if not isinstance(listener, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Each listener must be an object.",
            )

        db.add(
            NetworkListener(
                snapshot_id=snapshot.id,
                protocol=listener.get(
                    "protocol",
                    "UNKNOWN",
                ),
                bind_address=listener.get(
                    "bind_address",
                    "",
                ),
                port=listener.get("port", 0),
                pid=listener.get("pid"),
                process_name=listener.get("process_name"),
            )
        )

    profiles = firewall.get("profiles", {})

    if not isinstance(profiles, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="firewall.profiles must be an object.",
        )

    domain = profiles.get("domain", {})
    private = profiles.get("private", {})
    public = profiles.get("public", {})

    if not isinstance(domain, dict):
        domain = {}

    if not isinstance(private, dict):
        private = {}

    if not isinstance(public, dict):
        public = {}

    db.add(
        FirewallPosture(
            snapshot_id=snapshot.id,
            available=bool(firewall.get("available", False)),
            domain_enabled=domain.get("enabled"),
            private_enabled=private.get("enabled"),
            public_enabled=public.get("enabled"),
            error=firewall.get("error"),
        )
    )

        # ---------------------------------------------------------
    # N3.1 — Firewall Disabled Detection
    # ---------------------------------------------------------

    alerts = detect_firewall_disabled(firewall)

    # ---------------------------------------------------------
    # N3.2 — Unexpected Listener Detection
    # ---------------------------------------------------------

    current_listeners = [
        {
            "protocol": listener.get(
                "protocol",
                "UNKNOWN",
            ),
            "bind_address": listener.get(
                "bind_address",
                "",
            ),
            "port": listener.get(
                "port",
                0,
            ),
            "pid": listener.get("pid"),
            "process_name": listener.get(
                "process_name",
            ),
        }
        for listener in listener_records
    ]

    listener_alerts = detect_unexpected_listeners(
        current_listeners=current_listeners,
        previous_listeners=previous_listeners,
    )

    alerts.extend(listener_alerts)

    # ---------------------------------------------------------
    # N3.3 — RDP Exposure Detection
    # ---------------------------------------------------------

    rdp_alerts = detect_rdp_exposure(
        current_listeners,
    )

    alerts.extend(rdp_alerts)
    # ---------------------------------------------------------
    # N3.4 — Port Scan Detection
    # ---------------------------------------------------------

    port_scan_alerts = detect_port_scan(
        connections,
    )

    alerts.extend(port_scan_alerts)

    # ---------------------------------------------------------
    # N3.5 — Suspicious Outbound Connection Detection
    # ---------------------------------------------------------

    suspicious_outbound_alerts = detect_suspicious_outbound(
        connections,
    )

    alerts.extend(suspicious_outbound_alerts)

    for alert_data in alerts:
        db.add(
            Alert(
                device_id=current_agent.device_id,
                alert_type=alert_data["alert_type"],
                severity=alert_data["severity"],
                message=alert_data["message"],
                metric_value=alert_data["metric_value"],
                threshold=alert_data["threshold"],
            )
        )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(snapshot)

    return {
        "status": "accepted",
        "snapshot_id": snapshot.id,
        "device_id": current_agent.device_id,
        "organization_id": organization_id,
        "interfaces_stored": len(interfaces),
        "connections_stored": len(connections),
        "listeners_stored": len(listener_records),
        "firewall_stored": True,
        "alerts_generated": len(alerts),
    }



# =========================================================
# NETWORK SECURITY OVERVIEW
# =========================================================


@router.get("/overview")
def get_network_security_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organization = _require_user_organization(
        db,
        current_user,
    )

    organization_id = organization.id

    total_devices = (
        db.query(func.count(Agent.id))
        .filter(
            Agent.organization_id == organization_id,
        )
        .scalar()
        or 0
    )

    reporting_devices = (
        db.query(func.count(func.distinct(NetworkSnapshot.device_id)))
        .filter(
            NetworkSnapshot.organization_id == organization_id,
        )
        .scalar()
        or 0
    )

    total_interfaces = (
        db.query(func.count(NetworkInterface.id))
        .join(
            NetworkSnapshot,
            NetworkSnapshot.id == NetworkInterface.snapshot_id,
        )
        .filter(
            NetworkSnapshot.organization_id == organization_id,
        )
        .scalar()
        or 0
    )

    total_connections = (
        db.query(func.count(NetworkConnection.id))
        .join(
            NetworkSnapshot,
            NetworkSnapshot.id == NetworkConnection.snapshot_id,
        )
        .filter(
            NetworkSnapshot.organization_id == organization_id,
        )
        .scalar()
        or 0
    )

    total_listeners = (
        db.query(func.count(NetworkListener.id))
        .join(
            NetworkSnapshot,
            NetworkSnapshot.id == NetworkListener.snapshot_id,
        )
        .filter(
            NetworkSnapshot.organization_id == organization_id,
        )
        .scalar()
        or 0
    )

    firewall_disabled = (
        db.query(func.count(FirewallPosture.id))
        .join(
            NetworkSnapshot,
            NetworkSnapshot.id == FirewallPosture.snapshot_id,
        )
        .filter(
            NetworkSnapshot.organization_id == organization_id,
            (
                (FirewallPosture.domain_enabled.is_(False))
                | (FirewallPosture.private_enabled.is_(False))
                | (FirewallPosture.public_enabled.is_(False))
            ),
        )
        .scalar()
        or 0
    )

    latest_snapshot = (
        db.query(NetworkSnapshot)
        .filter(
            NetworkSnapshot.organization_id == organization_id,
        )
        .order_by(
            NetworkSnapshot.collected_at.desc(),
        )
        .first()
    )

    return {
        "organization_id": organization_id,
        "total_devices": total_devices,
        "reporting_devices": reporting_devices,
        "total_interfaces": total_interfaces,
        "total_connections": total_connections,
        "total_listeners": total_listeners,
        "firewall_disabled_snapshots": firewall_disabled,
        "latest_snapshot": (
            {
                "id": latest_snapshot.id,
                "device_id": latest_snapshot.device_id,
                "collected_at": latest_snapshot.collected_at,
            }
            if latest_snapshot
            else None
        ),
    }


# =========================================================
# NETWORK SECURITY DEVICE DETAILS
# =========================================================


@router.get("/devices/{device_id}")
def get_network_device_details(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organization = _require_user_organization(
        db,
        current_user,
    )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id,
            Agent.organization_id == organization.id,
        )
        .first()
    )

    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found.",
        )

    snapshot = (
        db.query(NetworkSnapshot)
        .filter(
            NetworkSnapshot.device_id == device_id,
            NetworkSnapshot.organization_id == organization.id,
        )
        .order_by(
            NetworkSnapshot.collected_at.desc(),
        )
        .first()
    )

    if snapshot is None:
        return {
            "device": {
                "device_id": agent.device_id,
                "hostname": agent.hostname,
                "operating_system": agent.operating_system,
                "os_version": agent.os_version,
                "agent_version": agent.agent_version,
                "last_seen": agent.last_seen,
            },
            "snapshot": None,
        }

    return {
        "device": {
            "device_id": agent.device_id,
            "hostname": agent.hostname,
            "operating_system": agent.operating_system,
            "os_version": agent.os_version,
            "agent_version": agent.agent_version,
            "last_seen": agent.last_seen,
        },
        "snapshot": {
            "id": snapshot.id,
            "collected_at": snapshot.collected_at,
            "interfaces": [
                {
                    "id": interface.id,
                    "interface_name": interface.interface_name,
                    "mac_address": interface.mac_address,
                    "is_up": interface.is_up,
                    "speed_mbps": interface.speed_mbps,
                    "addresses": interface.addresses,
                }
                for interface in snapshot.interfaces
            ],
            "connections": [
                {
                    "id": connection.id,
                    "protocol": connection.protocol,
                    "local_address": connection.local_address,
                    "local_port": connection.local_port,
                    "remote_address": connection.remote_address,
                    "remote_port": connection.remote_port,
                    "status": connection.status,
                    "pid": connection.pid,
                    "process_name": connection.process_name,
                }
                for connection in snapshot.connections
            ],
            "listeners": [
                {
                    "id": listener.id,
                    "protocol": listener.protocol,
                    "bind_address": listener.bind_address,
                    "port": listener.port,
                    "pid": listener.pid,
                    "process_name": listener.process_name,
                }
                for listener in snapshot.listeners
            ],
            "firewall_posture": (
                {
                    "available": snapshot.firewall_posture.available,
                    "domain_enabled": snapshot.firewall_posture.domain_enabled,
                    "private_enabled": snapshot.firewall_posture.private_enabled,
                    "public_enabled": snapshot.firewall_posture.public_enabled,
                    "error": snapshot.firewall_posture.error,
                }
                if snapshot.firewall_posture
                else None
            ),
        },
    }


# =========================================================
# NETWORK SECURITY SNAPSHOT HISTORY
# =========================================================


@router.get("/devices/{device_id}/snapshots")
def get_network_device_snapshots(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    organization = _require_user_organization(
        db,
        current_user,
    )

    agent = (
        db.query(Agent)
        .filter(
            Agent.device_id == device_id,
            Agent.organization_id == organization.id,
        )
        .first()
    )

    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found.",
        )

    snapshots = (
        db.query(NetworkSnapshot)
        .filter(
            NetworkSnapshot.device_id == device_id,
            NetworkSnapshot.organization_id == organization.id,
        )
        .order_by(
            NetworkSnapshot.collected_at.desc(),
        )
        .limit(50)
        .all()
    )

    return {
        "device_id": device_id,
        "snapshots": [
            {
                "id": snapshot.id,
                "collected_at": snapshot.collected_at,
                "interfaces": len(snapshot.interfaces),
                "connections": len(snapshot.connections),
                "listeners": len(snapshot.listeners),
                "firewall_available": (
                    snapshot.firewall_posture.available
                    if snapshot.firewall_posture
                    else False
                ),
                "firewall_domain_enabled": (
                    snapshot.firewall_posture.domain_enabled
                    if snapshot.firewall_posture
                    else None
                ),
                "firewall_private_enabled": (
                    snapshot.firewall_posture.private_enabled
                    if snapshot.firewall_posture
                    else None
                ),
                "firewall_public_enabled": (
                    snapshot.firewall_posture.public_enabled
                    if snapshot.firewall_posture
                    else None
                ),
            }
            for snapshot in snapshots
        ],
    }