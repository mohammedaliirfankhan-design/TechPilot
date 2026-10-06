from app.services.network_detection import (
    detect_firewall_disabled,
)


def test_firewall_enabled_returns_no_alerts():
    firewall = {
        "available": True,
        "profiles": {
            "domain": {"enabled": True},
            "private": {"enabled": True},
            "public": {"enabled": True},
        },
    }

    alerts = detect_firewall_disabled(firewall)

    assert alerts == []


def test_firewall_disabled_generates_critical_alert():
    firewall = {
        "available": True,
        "profiles": {
            "domain": {"enabled": True},
            "private": {"enabled": False},
            "public": {"enabled": True},
        },
    }

    alerts = detect_firewall_disabled(firewall)

    assert len(alerts) == 1

    alert = alerts[0]

    assert alert["alert_type"] == "NETWORK_FIREWALL_DISABLED"
    assert alert["severity"] == "CRITICAL"
    assert alert["metric_value"] == 1.0
    assert alert["threshold"] == 0.0
    assert "PRIVATE" in alert["message"]


def test_multiple_firewall_profiles_disabled():
    firewall = {
        "available": True,
        "profiles": {
            "domain": {"enabled": False},
            "private": {"enabled": False},
            "public": {"enabled": True},
        },
    }

    alerts = detect_firewall_disabled(firewall)

    assert len(alerts) == 1

    alert = alerts[0]

    assert alert["metric_value"] == 2.0
    assert "DOMAIN" in alert["message"]
    assert "PRIVATE" in alert["message"]


def test_missing_firewall_profiles_do_not_trigger_alert():
    firewall = {
        "available": True,
        "profiles": {},
    }

    alerts = detect_firewall_disabled(firewall)

    assert alerts == []