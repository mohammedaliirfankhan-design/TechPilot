from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.agent import Agent
from app.models.firewall_posture import FirewallPosture
from app.models.network_connection import NetworkConnection
from app.models.network_interface import NetworkInterface
from app.models.network_listener import NetworkListener
from app.models.network_snapshot import NetworkSnapshot
from app.security.agent_auth import get_current_agent


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
    }