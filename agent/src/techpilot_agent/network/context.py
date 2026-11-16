"""
Network context (read-only).

Answers the plain-language questions the admin page needs:
  - Which Wi-Fi network is this PC on, and how strong is the signal?
  - Does Windows treat that network as Public, Private or the company domain?
  - What is the router (gateway) address and which DNS servers are used?
  - Is antivirus protection switched on and up to date?

These things change rarely, and reading them through PowerShell can take
several seconds on a slow PC, so the result is cached and refreshed in a
background thread. get_network_context() never blocks the agent's main
loop: it returns the last good result immediately.

Nothing in this module changes any setting.
"""

import json
import re
import subprocess
import threading
import time

from techpilot_agent.network.dns import browser_dns_policy


REFRESH_INTERVAL_SECONDS = 300
NETSH_TIMEOUT_SECONDS = 15
POWERSHELL_TIMEOUT_SECONDS = 60

_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

_cache: dict | None = None
_cache_time: float = 0.0
_refreshing = False
_lock = threading.Lock()


def _run(command: list[str], timeout: int) -> str:
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        errors="replace",
        timeout=timeout,
        check=False,
        creationflags=_NO_WINDOW,
    )
    return result.stdout or ""


# ---------------------------------------------------------
# Wi-Fi (netsh wlan)
# ---------------------------------------------------------

_KV = re.compile(r"^\s*([^:]+?)\s*:\s*(.*?)\s*$")


def collect_wifi() -> list[dict]:
    """
    Read connected Wi-Fi adapters.

    Note: on Windows 11 24H2 and later, netsh only reveals the network
    name when Location services are allowed. If it's blocked, the
    network name still comes through from the connection profile below.
    """

    try:
        output = _run(
            ["netsh", "wlan", "show", "interfaces"],
            NETSH_TIMEOUT_SECONDS,
        )
    except (subprocess.SubprocessError, OSError):
        return []

    adapters: list[dict] = []
    current: dict | None = None

    for line in output.splitlines():
        match = _KV.match(line)
        if not match:
            continue

        key = match.group(1).strip().lower()
        value = match.group(2).strip()

        if key == "name":
            current = {"adapter": value}
            adapters.append(current)
            continue

        if current is None:
            continue

        if key == "ssid":
            current["ssid"] = value or None
        elif key == "state":
            current["state"] = value.lower()
        elif key == "signal":
            digits = re.sub(r"[^0-9]", "", value)
            current["signal_percent"] = int(digits) if digits else None
        elif key == "authentication":
            current["authentication"] = value
        elif key == "radio type":
            current["radio_type"] = value
        elif key == "band":
            current["band"] = value

    return [
        a for a in adapters
        if a.get("state") in (None, "connected")
    ]


# ---------------------------------------------------------
# Profiles, gateway, DNS, antivirus (one PowerShell call)
# ---------------------------------------------------------

_PS_SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'
$o = [ordered]@{}

$o.profiles = @(Get-NetConnectionProfile | ForEach-Object {
  [ordered]@{
    name     = $_.Name
    alias    = $_.InterfaceAlias
    category = [string]$_.NetworkCategory
    ipv4     = [string]$_.IPv4Connectivity
  }
})

$o.routes = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object {
  [ordered]@{
    alias   = $_.InterfaceAlias
    gateway = $_.IPv4DefaultGateway.NextHop
    dns     = @($_.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses })
  }
})

$m = Get-MpComputerStatus
if ($m) {
  $o.defender = [ordered]@{
    service            = $m.AMServiceEnabled
    antivirus          = $m.AntivirusEnabled
    realtime           = $m.RealTimeProtectionEnabled
    signature_age_days = $m.AntivirusSignatureAge
  }
}

$o.antivirus = @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct | ForEach-Object {
  [ordered]@{ name = $_.displayName; state = $_.productState }
})

$o | ConvertTo-Json -Compress -Depth 5
"""


def _decode_av_state(state) -> dict:
    """
    Windows Security Center packs antivirus status into one number.
    Middle byte bit 0x10 = protection on; low byte 0x00 = definitions
    up to date.
    """

    try:
        value = int(state)
    except (TypeError, ValueError):
        return {"enabled": None, "up_to_date": None}

    return {
        "enabled": bool((value >> 8) & 0x10),
        "up_to_date": (value & 0xFF) == 0,
    }


def collect_system_context() -> dict:
    try:
        output = _run(
            [
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                _PS_SCRIPT,
            ],
            POWERSHELL_TIMEOUT_SECONDS,
        ).strip()
    except subprocess.TimeoutExpired:
        return {"error": "Network details query timed out."}
    except (subprocess.SubprocessError, OSError) as exc:
        return {"error": str(exc)[:300]}

    if not output:
        return {"error": "No network details returned."}

    try:
        data = json.loads(output)
    except json.JSONDecodeError as exc:
        return {"error": f"Could not read network details: {exc}"[:300]}

    def as_list(value):
        if value is None:
            return []
        return value if isinstance(value, list) else [value]

    antivirus = []
    for product in as_list(data.get("antivirus")):
        if not isinstance(product, dict):
            continue
        antivirus.append(
            {
                "name": product.get("name"),
                **_decode_av_state(product.get("state")),
            }
        )

    routes = []
    for route in as_list(data.get("routes")):
        if not isinstance(route, dict):
            continue
        routes.append(
            {
                "alias": route.get("alias"),
                "gateway": route.get("gateway"),
                "dns": [d for d in as_list(route.get("dns")) if isinstance(d, str)],
            }
        )

    return {
        "profiles": [p for p in as_list(data.get("profiles")) if isinstance(p, dict)],
        "routes": routes,
        "defender": data.get("defender") if isinstance(data.get("defender"), dict) else None,
        "antivirus": antivirus,
    }


# ---------------------------------------------------------
# Cached public entry point
# ---------------------------------------------------------

def _refresh() -> None:
    global _cache, _cache_time, _refreshing

    try:
        context = {
            "wifi": collect_wifi(),
            **collect_system_context(),
            "browser_dns": browser_dns_policy(),
            "collected_at": time.time(),
        }

        with _lock:
            _cache = context
            _cache_time = time.monotonic()

    except Exception as exc:  # never let this thread crash the agent
        with _lock:
            if _cache is None:
                _cache = {"error": f"{type(exc).__name__}: {exc}"[:300]}
                _cache_time = time.monotonic()

    finally:
        with _lock:
            _refreshing = False


def get_network_context() -> dict | None:
    """
    Return the latest network context without blocking.

    Starts a background refresh when the cached copy is older than
    REFRESH_INTERVAL_SECONDS. Returns None until the first refresh
    has finished (usually within a few seconds of agent start).
    """

    global _refreshing

    with _lock:
        stale = (
            _cache is None
            or time.monotonic() - _cache_time >= REFRESH_INTERVAL_SECONDS
        )

        if stale and not _refreshing:
            _refreshing = True
            threading.Thread(
                target=_refresh,
                daemon=True,
                name="network-context",
            ).start()

        return _cache
