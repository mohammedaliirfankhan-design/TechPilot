from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.telemetry import Telemetry
from app.models.alert import Alert
from app.models.agent import Agent
from app.services.alert_engine import evaluate_telemetry
from app.security.agent_auth import get_current_agent


router = APIRouter(
    prefix="/api/v1/telemetry",
    tags=["Telemetry"],
)


@router.post("/")
def receive_telemetry(
    telemetry_data: dict,
    db: Session = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    if current_agent.device_id != telemetry_data.get("device_id"):
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent credential does not match device.",
        )

    telemetry = Telemetry(
        device_id=telemetry_data["device_id"],
        hostname=telemetry_data["hostname"],
        cpu_percent=telemetry_data["cpu_percent"],
        memory_percent=telemetry_data["memory_percent"],
        disk_percent=telemetry_data["disk_percent"],
    )

    db.add(telemetry)
    db.commit()
    db.refresh(telemetry)

    # Evaluate telemetry against alert thresholds
    alerts = evaluate_telemetry(telemetry_data)

    # Store generated alerts
    for alert_data in alerts:
        alert = Alert(
            device_id=telemetry_data["device_id"],
            alert_type=alert_data["alert_type"],
            severity=alert_data["severity"],
            message=alert_data["message"],
            metric_value=alert_data["metric_value"],
            threshold=alert_data["threshold"],
        )

        db.add(alert)

    db.commit()

    return {
        "status": "accepted",
        "telemetry_id": telemetry.id,
        "alerts_generated": len(alerts),
    }