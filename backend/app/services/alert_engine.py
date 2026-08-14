def evaluate_telemetry(telemetry_data: dict) -> list[dict]:
    """
    Evaluate telemetry against TechPilot alert thresholds.
    Returns a list of alert definitions.
    """

    alerts = []

    cpu = telemetry_data["cpu_percent"]
    memory = telemetry_data["memory_percent"]
    disk = telemetry_data["disk_percent"]

    # High CPU
    if cpu > 80:
        alerts.append(
            {
                "alert_type": "HIGH_CPU",
                "severity": "HIGH",
                "message": f"CPU utilization is {cpu:.1f}%",
                "metric_value": cpu,
                "threshold": 80.0,
            }
        )

    # High Memory
    if memory > 90:
        alerts.append(
            {
                "alert_type": "HIGH_MEMORY",
                "severity": "HIGH",
                "message": f"Memory utilization is {memory:.1f}%",
                "metric_value": memory,
                "threshold": 90.0,
            }
        )

    # High Disk Usage
    if disk > 85:
        alerts.append(
            {
                "alert_type": "HIGH_DISK",
                "severity": "HIGH",
                "message": f"Disk utilization is {disk:.1f}%",
                "metric_value": disk,
                "threshold": 85.0,
            }
        )

    return alerts