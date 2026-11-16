// ---------------------------------------------------------
// Network insights
// Turns raw agent network telemetry into plain-language
// findings an admin can read without knowing ports or IPs.
// Pure functions only: no React, no fetching.
// ---------------------------------------------------------

export type NetworkInterface = {
  id: number;
  interface_name: string;
  mac_address: string | null;
  is_up: boolean;
  speed_mbps: number | null;
  addresses: unknown;
};

export type NetworkConnection = {
  id: number;
  protocol: string;
  local_address: string | null;
  local_port: number | null;
  remote_address: string | null;
  remote_port: number | null;
  status: string | null;
  pid: number | null;
  process_name: string | null;
};

export type NetworkListener = {
  id: number;
  protocol: string;
  bind_address: string | null;
  port: number;
  pid: number | null;
  process_name: string | null;
};

export type FirewallPosture = {
  available: boolean;
  domain_enabled: boolean | null;
  private_enabled: boolean | null;
  public_enabled: boolean | null;
  error: string | null;
};

export type NetworkSnapshot = {
  id: number;
  collected_at: string;
  interfaces: NetworkInterface[];
  connections: NetworkConnection[];
  listeners: NetworkListener[];
  firewall_posture: FirewallPosture | null;
};

export type Severity = "good" | "info" | "warn" | "risk";
export type Verdict = "safe" | "attention" | "risk" | "unknown";

export type Finding = {
  severity: Severity;
  title: string;
  detail: string;
};

// ---------------------------------------------------------
// IP helpers
// ---------------------------------------------------------

export type AddressScope =
  | "this-device"
  | "local-network"
  | "internet"
  | "unknown";

export function addressScope(
  address: string | null | undefined,
): AddressScope {
  if (!address) return "unknown";

  const ip = address.replace(/^::ffff:/i, "").toLowerCase();

  if (
    ip === "127.0.0.1" ||
    ip.startsWith("127.") ||
    ip === "::1" ||
    ip === "localhost"
  ) {
    return "this-device";
  }

  if (ip.includes(":")) {
    // IPv6
    if (
      ip.startsWith("fe80") ||
      ip.startsWith("fc") ||
      ip.startsWith("fd")
    ) {
      return "local-network";
    }
    return "internet";
  }

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return "unknown";
  }

  const [a, b] = parts;

  if (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT / Tailscale
  ) {
    return "local-network";
  }

  return "internet";
}

function isWildcardBind(address: string | null) {
  if (!address) return true;
  return (
    address === "0.0.0.0" ||
    address === "::" ||
    address === "*" ||
    address === "[::]"
  );
}

// ---------------------------------------------------------
// Ports → plain words
// ---------------------------------------------------------

type PortInfo = {
  name: string;
  meaning: string;
  // How worrying it is to have this open to the network.
  exposure: "normal" | "review" | "risky";
};

const PORTS: Record<number, PortInfo> = {
  20: { name: "FTP data", meaning: "Old-style file transfer", exposure: "risky" },
  21: { name: "FTP", meaning: "Old-style file transfer, sends passwords unencrypted", exposure: "risky" },
  22: { name: "SSH", meaning: "Remote command-line login", exposure: "review" },
  23: { name: "Telnet", meaning: "Unencrypted remote login", exposure: "risky" },
  25: { name: "Mail server", meaning: "Sends email", exposure: "review" },
  53: { name: "DNS", meaning: "Looks up website names", exposure: "normal" },
  80: { name: "Web (HTTP)", meaning: "Unencrypted website traffic", exposure: "review" },
  110: { name: "POP3", meaning: "Old email download", exposure: "review" },
  123: { name: "Time sync", meaning: "Keeps the clock correct", exposure: "normal" },
  135: { name: "Windows RPC", meaning: "Windows internal service", exposure: "normal" },
  137: { name: "NetBIOS", meaning: "Windows network names", exposure: "review" },
  138: { name: "NetBIOS", meaning: "Windows network names", exposure: "review" },
  139: { name: "NetBIOS sharing", meaning: "Old Windows file sharing", exposure: "risky" },
  143: { name: "IMAP", meaning: "Email access", exposure: "review" },
  443: { name: "Web (HTTPS)", meaning: "Secure website traffic", exposure: "normal" },
  445: { name: "File sharing (SMB)", meaning: "Windows shared folders and printers", exposure: "risky" },
  465: { name: "Secure mail", meaning: "Sends email securely", exposure: "normal" },
  587: { name: "Mail submission", meaning: "Sends email", exposure: "normal" },
  993: { name: "Secure IMAP", meaning: "Secure email access", exposure: "normal" },
  995: { name: "Secure POP3", meaning: "Secure email download", exposure: "normal" },
  1433: { name: "SQL Server", meaning: "Database", exposure: "risky" },
  1521: { name: "Oracle DB", meaning: "Database", exposure: "risky" },
  1900: { name: "UPnP / SSDP", meaning: "Finds devices on the local network", exposure: "review" },
  3306: { name: "MySQL", meaning: "Database", exposure: "risky" },
  3389: { name: "Remote Desktop", meaning: "Lets someone log in to this screen remotely", exposure: "risky" },
  5040: { name: "Windows service", meaning: "Windows internal service", exposure: "normal" },
  5353: { name: "mDNS", meaning: "Finds devices on the local network", exposure: "normal" },
  5355: { name: "LLMNR", meaning: "Windows local name lookup", exposure: "review" },
  5432: { name: "PostgreSQL", meaning: "Database", exposure: "risky" },
  5900: { name: "VNC", meaning: "Screen sharing / remote control", exposure: "risky" },
  5985: { name: "WinRM", meaning: "Remote Windows management", exposure: "risky" },
  5986: { name: "WinRM (secure)", meaning: "Remote Windows management", exposure: "review" },
  6379: { name: "Redis", meaning: "Database / cache", exposure: "risky" },
  7680: { name: "Delivery Optimization", meaning: "Windows Update sharing", exposure: "normal" },
  8080: { name: "Web (alt)", meaning: "Web server or proxy", exposure: "review" },
  27017: { name: "MongoDB", meaning: "Database", exposure: "risky" },
};

// Remote ports that usually mean something unwanted.
const SUSPICIOUS_REMOTE_PORTS: Record<number, string> = {
  23: "Unencrypted remote login (Telnet)",
  1337: "Port commonly used by hacking tools",
  4444: "Port commonly used by remote-control malware",
  5555: "Port commonly used by remote-control malware",
  6666: "Chat channel often used by malware (IRC)",
  6667: "Chat channel often used by malware (IRC)",
  6697: "Chat channel often used by malware (IRC)",
  9001: "Tor anonymity network",
  9030: "Tor anonymity network",
  9050: "Tor anonymity network",
  9150: "Tor anonymity network",
  31337: "Port commonly used by hacking tools",
};

const COMMON_REMOTE_PORTS = new Set([
  53, 80, 123, 443, 465, 587, 993, 995, 3478, 5228, 5223, 8443,
]);

export function describePort(port: number): PortInfo {
  if (PORTS[port]) return PORTS[port];

  if (port >= 49152) {
    return {
      name: "Dynamic port",
      meaning: "Temporary port used by an app or Windows service",
      exposure: "normal",
    };
  }

  return {
    name: `Port ${port}`,
    meaning: "Used by an installed app",
    exposure: "review",
  };
}

export function describeRemotePort(port: number | null): string {
  if (port === null) return "Unknown";
  if (port === 443) return "Secure web";
  if (port === 80) return "Unencrypted web";
  if (port === 53) return "Name lookup";
  if (SUSPICIOUS_REMOTE_PORTS[port]) return SUSPICIOUS_REMOTE_PORTS[port];
  return PORTS[port]?.name ?? `Port ${port}`;
}

// ---------------------------------------------------------
// Network adapters → "how is it connected"
// ---------------------------------------------------------

export type AdapterKind =
  | "wifi"
  | "ethernet"
  | "vpn"
  | "virtual"
  | "other";

export type ConnectedAdapter = {
  name: string;
  kind: AdapterKind;
  ipv4: string | null;
  speedMbps: number | null;
};

export function adapterKind(name: string): AdapterKind {
  const n = name.toLowerCase();

  if (
    /loopback|vethernet|virtualbox|vmware|hyper-v|wsl|docker|bluetooth|isatap|teredo|pseudo/.test(n)
  ) {
    return "virtual";
  }

  if (
    /vpn|tap-|tun|wireguard|openvpn|tailscale|zerotier|anyconnect|fortinet|forticlient|globalprotect|pangp|nordlynx|proton|wintun|cloudflare warp/.test(n)
  ) {
    return "vpn";
  }

  if (/wi-?fi|wireless|wlan|802\.11/.test(n)) return "wifi";
  if (/ethernet|eth\d|local area connection|lan/.test(n)) return "ethernet";

  return "other";
}

export function extractAddresses(addresses: unknown): string[] {
  if (!addresses) return [];

  const list = Array.isArray(addresses) ? addresses : [addresses];

  return list
    .map((item) => {
      if (item && typeof item === "object") {
        const value = item as Record<string, unknown>;
        if (typeof value.address === "string") return value.address;
      }
      return typeof item === "string" ? item : "";
    })
    .filter(Boolean);
}

function firstIPv4(addresses: unknown): string | null {
  return (
    extractAddresses(addresses).find(
      (a) =>
        /^\d{1,3}(\.\d{1,3}){3}$/.test(a) &&
        !a.startsWith("127.") &&
        !a.startsWith("169.254."),
    ) ?? null
  );
}

export function connectedAdapters(
  interfaces: NetworkInterface[],
): ConnectedAdapter[] {
  return interfaces
    .filter((i) => i.is_up)
    .map((i) => ({
      name: i.interface_name,
      kind: adapterKind(i.interface_name),
      ipv4: firstIPv4(i.addresses),
      speedMbps: i.speed_mbps,
    }))
    .filter((a) => a.kind !== "virtual" && a.ipv4 !== null)
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
}

function kindRank(kind: AdapterKind) {
  return { ethernet: 0, wifi: 1, other: 2, vpn: 3, virtual: 4 }[kind];
}

export const ADAPTER_LABEL: Record<AdapterKind, string> = {
  wifi: "Wi-Fi",
  ethernet: "Wired (Ethernet)",
  vpn: "VPN",
  virtual: "Virtual adapter",
  other: "Network adapter",
};

// ---------------------------------------------------------
// Open doors (listening ports)
// ---------------------------------------------------------

export type OpenDoor = {
  port: number;
  protocol: string;
  apps: string[];
  info: PortInfo;
  reachableFromNetwork: boolean;
};

export function openDoors(listeners: NetworkListener[]): OpenDoor[] {
  const byPort = new Map<string, OpenDoor>();

  for (const l of listeners) {
    const key = `${l.protocol}-${l.port}`;
    const reachable =
      isWildcardBind(l.bind_address) ||
      addressScope(l.bind_address) !== "this-device";

    const existing = byPort.get(key);
    const app = l.process_name || "Unknown app";

    if (existing) {
      existing.reachableFromNetwork ||= reachable;
      if (!existing.apps.includes(app)) existing.apps.push(app);
    } else {
      byPort.set(key, {
        port: l.port,
        protocol: l.protocol.toUpperCase(),
        apps: [app],
        info: describePort(l.port),
        reachableFromNetwork: reachable,
      });
    }
  }

  const rank = { risky: 0, review: 1, normal: 2 };

  return [...byPort.values()].sort(
    (a, b) =>
      Number(b.reachableFromNetwork) - Number(a.reachableFromNetwork) ||
      rank[a.info.exposure] - rank[b.info.exposure] ||
      a.port - b.port,
  );
}

// ---------------------------------------------------------
// Who is it talking to (outbound connections)
// ---------------------------------------------------------

export type AppActivity = {
  app: string;
  internet: number;
  localNetwork: number;
  destinations: number;
  flagged: number;
};

export type FlaggedConnection = {
  app: string;
  remote: string;
  port: number | null;
  reason: string;
  severity: Severity;
};

function activeRemote(connections: NetworkConnection[]) {
  return connections.filter(
    (c) =>
      c.remote_address &&
      addressScope(c.remote_address) !== "this-device" &&
      c.status !== "LISTEN",
  );
}

export function flagConnection(
  c: NetworkConnection,
): FlaggedConnection | null {
  const app = c.process_name || "Unknown app";
  const remote = c.remote_address ?? "";
  const scope = addressScope(remote);
  const port = c.remote_port;

  if (scope !== "internet" || port === null) return null;

  if (SUSPICIOUS_REMOTE_PORTS[port]) {
    return {
      app,
      remote,
      port,
      reason: SUSPICIOUS_REMOTE_PORTS[port],
      severity: "risk",
    };
  }

  if (port === 80) {
    return {
      app,
      remote,
      port,
      reason: "Unencrypted web traffic. Anyone on the network path could read it.",
      severity: "info",
    };
  }

  if (!COMMON_REMOTE_PORTS.has(port) && port < 49152 && !c.process_name) {
    return {
      app,
      remote,
      port,
      reason: "An unidentified app is talking to the internet on an unusual port.",
      severity: "warn",
    };
  }

  return null;
}

export function appActivity(
  connections: NetworkConnection[],
): AppActivity[] {
  const map = new Map<string, AppActivity & { _dest: Set<string> }>();

  for (const c of activeRemote(connections)) {
    const app = c.process_name || "Unknown app";
    const scope = addressScope(c.remote_address);

    let row = map.get(app);
    if (!row) {
      row = {
        app,
        internet: 0,
        localNetwork: 0,
        destinations: 0,
        flagged: 0,
        _dest: new Set(),
      };
      map.set(app, row);
    }

    if (scope === "internet") row.internet += 1;
    else row.localNetwork += 1;

    row._dest.add(c.remote_address ?? "");
    const flag = flagConnection(c);
    if (flag?.severity === "risk" || flag?.severity === "warn") {
      row.flagged += 1;
    }
  }

  return [...map.values()]
    .map(({ _dest, ...rest }) => ({ ...rest, destinations: _dest.size }))
    .sort(
      (a, b) =>
        b.flagged - a.flagged ||
        b.internet + b.localNetwork - (a.internet + a.localNetwork),
    );
}

export function flaggedConnections(
  connections: NetworkConnection[],
): FlaggedConnection[] {
  const rank = { risk: 0, warn: 1, info: 2, good: 3 };
  const seen = new Set<string>();

  return activeRemote(connections)
    .map(flagConnection)
    .filter((f): f is FlaggedConnection => f !== null)
    .filter((f) => {
      const key = `${f.app}|${f.remote}|${f.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---------------------------------------------------------
// Firewall in plain words
// ---------------------------------------------------------

export type FirewallSummary = {
  severity: Severity;
  headline: string;
  detail: string;
};

export function summarizeFirewall(
  posture: FirewallPosture | null,
): FirewallSummary {
  if (!posture || !posture.available) {
    return {
      severity: "warn",
      headline: "Firewall status unknown",
      detail:
        posture?.error ??
        "The agent could not read the Windows Firewall settings on this device.",
    };
  }

  const off: string[] = [];
  if (posture.public_enabled === false) off.push("public networks (cafés, airports, hotspots)");
  if (posture.private_enabled === false) off.push("home and trusted networks");
  if (posture.domain_enabled === false) off.push("the company network");

  if (off.length === 0) {
    return {
      severity: "good",
      headline: "Firewall is on",
      detail:
        "Windows Firewall is switched on for every type of network this device might join.",
    };
  }

  if (posture.public_enabled === false) {
    return {
      severity: "risk",
      headline: "Firewall is off on public networks",
      detail: `Windows Firewall is switched off for ${joinWords(off)}. If this device joins public Wi-Fi, other people on that network can reach it.`,
    };
  }

  return {
    severity: "warn",
    headline: "Firewall is partly off",
    detail: `Windows Firewall is switched off for ${joinWords(off)}.`,
  };
}

function joinWords(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------
// Verdict
// ---------------------------------------------------------

export type DeviceAssessment = {
  verdict: Verdict;
  headline: string;
  findings: Finding[];
};

const STALE_AFTER_MINUTES = 60;

export function assessDevice(
  snapshot: NetworkSnapshot | null,
  now: Date = new Date(),
): DeviceAssessment {
  if (!snapshot) {
    return {
      verdict: "unknown",
      headline: "No network report from this device yet",
      findings: [
        {
          severity: "info",
          title: "Waiting for the agent",
          detail:
            "Once the TechAIPILOT agent on this device sends its first network report, its safety check will appear here.",
        },
      ],
    };
  }

  const findings: Finding[] = [];

  // Freshness
  const collected = new Date(snapshot.collected_at);
  const ageMinutes = (now.getTime() - collected.getTime()) / 60000;
  if (!Number.isNaN(ageMinutes) && ageMinutes > STALE_AFTER_MINUTES) {
    findings.push({
      severity: "info",
      title: "This check may be out of date",
      detail: `The last network report arrived ${relativeTime(collected, now)}. The device may be offline.`,
    });
  }

  // Firewall
  const fw = summarizeFirewall(snapshot.firewall_posture);
  findings.push({ severity: fw.severity, title: fw.headline, detail: fw.detail });

  // Open doors
  const firewallOff =
    fw.severity === "risk" || fw.severity === "warn";
  const exposed = openDoors(snapshot.listeners).filter(
    (d) => d.reachableFromNetwork && d.info.exposure === "risky",
  );

  if (exposed.length > 0) {
    const names = exposed.slice(0, 3).map((d) => d.info.name);
    findings.push({
      severity: firewallOff ? "risk" : "warn",
      title:
        exposed.length === 1
          ? `${names[0]} is open to the network`
          : `${exposed.length} sensitive services are open to the network`,
      detail: firewallOff
        ? `${joinWords(names)} can be reached by other computers, and the firewall is not fully on to filter them.`
        : `${joinWords(names)} can be reached by other computers. The firewall is on, but check these are needed.`,
    });
  } else {
    findings.push({
      severity: "good",
      title: "No sensitive services open",
      detail:
        "Nothing like Remote Desktop, file sharing or databases is accepting connections from other computers.",
    });
  }

  // Outbound
  const flags = flaggedConnections(snapshot.connections);
  const serious = flags.filter((f) => f.severity === "risk");
  const unusual = flags.filter((f) => f.severity === "warn");
  const plainWeb = flags.filter((f) => f.severity === "info");

  if (serious.length > 0) {
    findings.push({
      severity: "risk",
      title: `${serious.length} suspicious connection${serious.length > 1 ? "s" : ""}`,
      detail: `${serious[0].app}: ${serious[0].reason}.`,
    });
  }

  if (unusual.length > 0) {
    findings.push({
      severity: "warn",
      title: `${unusual.length} unusual connection${unusual.length > 1 ? "s" : ""}`,
      detail:
        "An app the agent could not identify is talking to the internet on a port normal apps rarely use.",
    });
  }

  if (plainWeb.length > 0) {
    findings.push({
      severity: "info",
      title: "Some unencrypted web traffic",
      detail: `${plainWeb.length} connection${plainWeb.length > 1 ? "s use" : " uses"} plain HTTP. Usually harmless updates or ads, but not private.`,
    });
  }

  if (serious.length === 0 && unusual.length === 0) {
    findings.push({
      severity: "good",
      title: "No suspicious connections",
      detail:
        "Every app talking to the internet is using normal, expected channels.",
    });
  }

  const order = { risk: 0, warn: 1, info: 2, good: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const hasRisk = findings.some((f) => f.severity === "risk");
  const hasWarn = findings.some((f) => f.severity === "warn");

  if (hasRisk) {
    return {
      verdict: "risk",
      headline: "This device is at risk",
      findings,
    };
  }

  if (hasWarn) {
    return {
      verdict: "attention",
      headline: "This device needs a look",
      findings,
    };
  }

  return {
    verdict: "safe",
    headline: "This device looks safe",
    findings,
  };
}

// ---------------------------------------------------------
// Time
// ---------------------------------------------------------

export function relativeTime(date: Date, now: Date = new Date()) {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (Number.isNaN(seconds)) return "at an unknown time";
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
