"""
Website names from the Windows DNS cache (read-only).

Every time a program on this PC opens a website, Windows looks up the
site's name and keeps the answer for a short while (usually 1-5 minutes).
This module samples that cache in a background thread, remembers every
name seen since the last report, and matches the names to the apps that
are connected to them.

Only domain names are collected - never full page addresses, page
content or browser history.

Note: browsers resolve names themselves unless the policies below are
set. The installer sets them; browser_dns_policy() reports whether they
are in place so the dashboard can say when browsing may be missing.
"""

import ipaddress
import json
import subprocess
import threading
import time

try:
    import winreg  # Windows only
except ImportError:  # pragma: no cover
    winreg = None


SAMPLE_INTERVAL_SECONDS = 30
POWERSHELL_TIMEOUT_SECONDS = 45
MAX_DOMAINS_PER_REPORT = 400

_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

# DNS record types in Get-DnsClientCache output.
_TYPE_A = 1
_TYPE_CNAME = 5
_TYPE_AAAA = 28

_PS_COMMAND = (
    "Get-DnsClientCache | "
    "Where-Object { $_.Status -eq 0 } | "
    "Select-Object Entry, Data, Type | "
    "ConvertTo-Json -Compress"
)

_IGNORED_SUFFIXES = (
    ".local",
    ".lan",
    ".home",
    ".internal",
    ".localdomain",
    ".mshome.net",
    ".in-addr.arpa",
    ".ip6.arpa",
    ".msftncsi.com",  # Windows "am I online" check
)

_lock = threading.Lock()
_seen: dict[str, dict] = {}        # domain -> {"ips": set, "first": t, "last": t}
_ip_to_domain: dict[str, str] = {}  # latest ip -> display domain
_thread_started = False


# ---------------------------------------------------------
# Reading the cache
# ---------------------------------------------------------

def _read_cache() -> list[dict]:
    try:
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                _PS_COMMAND,
            ],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=POWERSHELL_TIMEOUT_SECONDS,
            check=False,
            creationflags=_NO_WINDOW,
        )
    except (subprocess.SubprocessError, OSError):
        return []

    raw = (result.stdout or "").strip()
    if not raw:
        return []

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    if isinstance(data, dict):
        data = [data]

    records = []
    for item in data:
        if not isinstance(item, dict):
            continue
        entry = str(item.get("Entry") or "").strip().lower().rstrip(".")
        value = str(item.get("Data") or "").strip().lower().rstrip(".")
        try:
            rtype = int(item.get("Type"))
        except (TypeError, ValueError):
            continue
        if entry and value:
            records.append({"entry": entry, "data": value, "type": rtype})

    return records


def _is_interesting(name: str) -> bool:
    if "." not in name:
        return False
    if name.endswith(_IGNORED_SUFFIXES):
        return False
    try:
        ipaddress.ip_address(name)
        return False  # a bare IP is not a website name
    except ValueError:
        return True


def _resolve(records: list[dict]) -> dict[str, set]:
    """
    Turn cache records into {display_domain: {ips}}.

    Sites are often an alias for their hosting provider:
        www.rust-lang.org -> rust-lang.github.io -> 185.199.x.x
    We report the name the user asked for (www.rust-lang.org), not the
    hosting provider, by following CNAME chains from the top.
    """

    cnames: dict[str, set] = {}
    addresses: dict[str, set] = {}

    for r in records:
        if r["type"] == _TYPE_CNAME:
            cnames.setdefault(r["entry"], set()).add(r["data"])
        elif r["type"] in (_TYPE_A, _TYPE_AAAA):
            addresses.setdefault(r["entry"], set()).add(r["data"])

    alias_targets = {t for targets in cnames.values() for t in targets}

    def ips_for(name: str, depth: int = 0) -> set:
        if depth > 8:
            return set()
        found = set(addresses.get(name, set()))
        for target in cnames.get(name, set()):
            found |= ips_for(target, depth + 1)
        return found

    result: dict[str, set] = {}
    for name in set(cnames) | set(addresses):
        # A name that is only somebody else's alias target is the hosting
        # provider (github.io, cloudfront.net, azureedge.net...): skip it.
        if name in alias_targets or not _is_interesting(name):
            continue

        result[name] = ips_for(name)

    return result


def _sample_once() -> None:
    resolved = _resolve(_read_cache())
    now = time.time()

    with _lock:
        for domain, ips in resolved.items():
            item = _seen.setdefault(domain, {"ips": set(), "first": now, "last": now})
            item["ips"] |= ips
            item["last"] = now
            for ip in ips:
                _ip_to_domain[ip] = domain

        # Keep the IP map from growing forever.
        if len(_ip_to_domain) > 5000:
            _ip_to_domain.clear()


def _sampler_loop() -> None:
    while True:
        try:
            _sample_once()
        except Exception:
            pass  # never let sampling crash the agent
        time.sleep(SAMPLE_INTERVAL_SECONDS)


def start_dns_sampler() -> None:
    global _thread_started

    with _lock:
        if _thread_started:
            return
        _thread_started = True

    threading.Thread(
        target=_sampler_loop,
        daemon=True,
        name="dns-sampler",
    ).start()


# ---------------------------------------------------------
# Public: what to send with each network report
# ---------------------------------------------------------

def collect_domain_observations(connections: list[dict]) -> list[dict]:
    """
    Return the websites seen since the last report, each with the apps
    that were connected to it. Clears the "seen" list afterwards.

    `connections` is the list produced by collect_network_connections().
    """

    start_dns_sampler()

    with _lock:
        seen = dict(_seen)
        _seen.clear()
        ip_map = dict(_ip_to_domain)

    apps: dict[str, set] = {}
    counts: dict[str, int] = {}

    for c in connections or []:
        remote = (c.get("remote_address") or {}).get("address")
        if not remote:
            continue
        domain = ip_map.get(str(remote).lower())
        if not domain:
            continue
        counts[domain] = counts.get(domain, 0) + 1
        name = c.get("process_name")
        if name:
            apps.setdefault(domain, set()).add(name)
        seen.setdefault(domain, {"ips": set(), "first": time.time(), "last": time.time()})

    observations = [
        {
            "domain": domain,
            "apps": sorted(apps.get(domain, set()))[:10],
            "connections": counts.get(domain, 0),
        }
        for domain in seen
    ]

    # Domains with live connections first, then alphabetical.
    observations.sort(key=lambda o: (-o["connections"], o["domain"]))

    return observations[:MAX_DOMAINS_PER_REPORT]


def browser_dns_policy() -> dict:
    """
    Report whether browsers are set to use the Windows resolver, so the
    dashboard knows if browsing is visible on this PC.
    """

    def read(path: str, name: str):
        if winreg is None:
            return None
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path) as key:
                value, _ = winreg.QueryValueEx(key, name)
                return value
        except OSError:
            return None

    def configured(base: str) -> bool:
        return (
            read(base, "BuiltInDnsClientEnabled") == 0
            and str(read(base, "DnsOverHttpsMode") or "").lower() == "off"
        )

    return {
        "edge": configured(r"SOFTWARE\Policies\Microsoft\Edge"),
        "chrome": configured(r"SOFTWARE\Policies\Google\Chrome"),
    }
