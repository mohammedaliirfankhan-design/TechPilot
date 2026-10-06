from app.services.network_detection import (
    detect_firewall_disabled,
    detect_rdp_exposure,
    detect_unexpected_listeners,
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
    assert alerts[0]["alert_type"] == "NETWORK_FIREWALL_DISABLED"
    assert alerts[0]["severity"] == "CRITICAL"
    assert alerts[0]["metric_value"] == 1.0


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
    assert alerts[0]["metric_value"] == 2.0
    assert "DOMAIN" in alerts[0]["message"]
    assert "PRIVATE" in alerts[0]["message"]


def test_missing_firewall_profiles_do_not_trigger_alert():
    firewall = {
        "available": True,
        "profiles": {
            "domain": {"enabled": True},
        },
    }

    alerts = detect_firewall_disabled(firewall)

    assert alerts == []


def test_first_listener_snapshot_establishes_baseline():
    current = [
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 5432,
            "pid": 1000,
            "process_name": "postgres.exe",
        }
    ]

    alerts = detect_unexpected_listeners(
        current,
        [],
    )

    assert alerts == []


def test_new_external_listener_generates_high_alert():
    previous = [
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 5432,
            "pid": 1000,
            "process_name": "postgres.exe",
        }
    ]

    current = [
        *previous,
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 4444,
            "pid": 2000,
            "process_name": "unknown.exe",
        },
    ]

    alerts = detect_unexpected_listeners(
        current,
        previous,
    )

    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "NETWORK_UNEXPECTED_LISTENER"
    assert alerts[0]["severity"] == "HIGH"
    assert alerts[0]["metric_value"] == 4444.0
    assert "4444" in alerts[0]["message"]
    assert "unknown.exe" in alerts[0]["message"]


def test_existing_listener_does_not_generate_duplicate_alert():
    previous = [
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 5432,
            "pid": 1000,
            "process_name": "postgres.exe",
        }
    ]

    current = [
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 5432,
            "pid": 1000,
            "process_name": "postgres.exe",
        }
    ]

    alerts = detect_unexpected_listeners(
        current,
        previous,
    )

    assert alerts == []


def test_loopback_listener_is_ignored():
    previous = [
        {
            "protocol": "TCP",
            "bind_address": "127.0.0.1",
            "port": 25027,
            "pid": 1000,
            "process_name": "Code.exe",
        }
    ]

    current = [
        *previous,
        {
            "protocol": "TCP",
            "bind_address": "127.0.0.1",
            "port": 4444,
            "pid": 2000,
            "process_name": "unknown.exe",
        },
    ]

    alerts = detect_unexpected_listeners(
        current,
        previous,
    )

    assert alerts == []


def test_process_change_on_same_port_is_detected():
    previous = [
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 8080,
            "pid": 1000,
            "process_name": "oldservice.exe",
        }
    ]

    current = [
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 8080,
            "pid": 2000,
            "process_name": "newservice.exe",
        }
    ]

    alerts = detect_unexpected_listeners(
        current,
        previous,
    )

    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "NETWORK_UNEXPECTED_LISTENER"
    assert "newservice.exe" in alerts[0]["message"]


def test_udp_listener_is_supported():
    previous = [
        {
            "protocol": "UDP",
            "bind_address": "0.0.0.0",
            "port": 5353,
            "pid": 1000,
            "process_name": "dns.exe",
        }
    ]

    current = [
        *previous,
        {
            "protocol": "UDP",
            "bind_address": "0.0.0.0",
            "port": 9999,
            "pid": 2000,
            "process_name": "unknown.exe",
        },
    ]

    alerts = detect_unexpected_listeners(
        current,
        previous,
    )

    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "NETWORK_UNEXPECTED_LISTENER"
    assert alerts[0]["severity"] == "HIGH"
    assert alerts[0]["metric_value"] == 9999.0

def test_rdp_exposure_on_external_bind_generates_high_alert():
    listeners = [
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 3389,
            "pid": 1234,
            "process_name": "TermService",
        }
    ]

    alerts = detect_rdp_exposure(listeners)

    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "NETWORK_RDP_EXPOSURE"
    assert alerts[0]["severity"] == "HIGH"
    assert alerts[0]["metric_value"] == 3389.0
    assert "3389" in alerts[0]["message"]
    assert "TermService" in alerts[0]["message"]


def test_rdp_exposure_on_specific_network_interface_generates_alert():
    listeners = [
        {
            "protocol": "TCP",
            "bind_address": "192.168.0.25",
            "port": 3389,
            "pid": 1234,
            "process_name": "TermService",
        }
    ]

    alerts = detect_rdp_exposure(listeners)

    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "NETWORK_RDP_EXPOSURE"
    assert alerts[0]["severity"] == "HIGH"
    assert "192.168.0.25:3389" in alerts[0]["message"]


def test_loopback_rdp_listener_is_ignored():
    listeners = [
        {
            "protocol": "TCP",
            "bind_address": "127.0.0.1",
            "port": 3389,
            "pid": 1234,
            "process_name": "TermService",
        },
        {
            "protocol": "TCP",
            "bind_address": "::1",
            "port": 3389,
            "pid": 1234,
            "process_name": "TermService",
        },
    ]

    alerts = detect_rdp_exposure(listeners)

    assert alerts == []


def test_non_rdp_listener_does_not_trigger_rdp_alert():
    listeners = [
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 3390,
            "pid": 1234,
            "process_name": "someprocess.exe",
        },
        {
            "protocol": "TCP",
            "bind_address": "0.0.0.0",
            "port": 3388,
            "pid": 1235,
            "process_name": "someprocess.exe",
        },
    ]

    alerts = detect_rdp_exposure(listeners)

    assert alerts == []


def test_udp_3389_does_not_trigger_rdp_alert():
    listeners = [
        {
            "protocol": "UDP",
            "bind_address": "0.0.0.0",
            "port": 3389,
            "pid": 1234,
            "process_name": "someprocess.exe",
        }
    ]

    alerts = detect_rdp_exposure(listeners)

    assert alerts == []