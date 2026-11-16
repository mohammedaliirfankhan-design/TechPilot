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

export type NetworkContext = {
  wifi?: {
    adapter?: string;
    ssid?: string | null;
    signal_percent?: number | null;
    authentication?: string;
    radio_type?: string;
    band?: string;
  }[];
  profiles?: { name?: string; alias?: string; category?: string; ipv4?: string }[];
  routes?: { alias?: string; gateway?: string; dns?: string[] }[];
  defender?: {
    service?: boolean;
    antivirus?: boolean;
    realtime?: boolean;
    signature_age_days?: number;
  } | null;
  antivirus?: { name?: string; enabled?: boolean | null; up_to_date?: boolean | null }[];
  browser_dns?: { edge?: boolean; chrome?: boolean };
  error?: string;
};

export type NetworkSnapshot = {
  id: number;
  collected_at: string;
  context?: NetworkContext | null;
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
  137: { name: "Windows network names", meaning: "Lets other PCs see this computer's name", exposure: "review" },
  138: { name: "Windows network names", meaning: "Lets other PCs see this computer's name", exposure: "review" },
  139: { name: "Old file sharing", meaning: "Older form of Windows file sharing", exposure: "review" },
  143: { name: "IMAP", meaning: "Email access", exposure: "review" },
  443: { name: "Web (HTTPS)", meaning: "Secure website traffic", exposure: "normal" },
  445: { name: "File sharing", meaning: "Shared folders and printers", exposure: "review" },
  465: { name: "Secure mail", meaning: "Sends email securely", exposure: "normal" },
  587: { name: "Mail submission", meaning: "Sends email", exposure: "normal" },
  993: { name: "Secure IMAP", meaning: "Secure email access", exposure: "normal" },
  995: { name: "Secure POP3", meaning: "Secure email download", exposure: "normal" },
  1433: { name: "SQL Server", meaning: "Database", exposure: "risky" },
  1521: { name: "Oracle DB", meaning: "Database", exposure: "risky" },
  1900: { name: "Device discovery", meaning: "Finds printers, TVs and other devices nearby", exposure: "review" },
  3306: { name: "MySQL", meaning: "Database", exposure: "risky" },
  3389: { name: "Remote Desktop", meaning: "Lets someone log in to this screen remotely", exposure: "risky" },
  5040: { name: "Windows service", meaning: "Windows internal service", exposure: "normal" },
  5353: { name: "mDNS", meaning: "Finds devices on the local network", exposure: "normal" },
  5355: { name: "Windows network names", meaning: "Lets other PCs see this computer's name", exposure: "review" },
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
    const info = describePort(l.port);
    // Group by what it means, so 137/138/5355 show once.
    const key = PORTS[l.port] ? info.name : `${l.protocol}-${l.port}`;
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
        info,
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

const CLOSED_STATES = new Set([
  "LISTEN",
  "TIME_WAIT",
  "CLOSE_WAIT",
  "CLOSED",
  "FIN_WAIT1",
  "FIN_WAIT2",
  "LAST_ACK",
  "CLOSING",
]);

export function isLiveConnection(c: NetworkConnection) {
  return (
    !!c.remote_address &&
    addressScope(c.remote_address) !== "this-device" &&
    !CLOSED_STATES.has((c.status ?? "").toUpperCase()) &&
    c.pid !== 0 &&
    c.process_name !== "System Idle Process"
  );
}

function activeRemote(connections: NetworkConnection[]) {
  return connections.filter(isLiveConnection);
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
// Network context (agent 1.3.0+)
// ---------------------------------------------------------

export type NetworkKind = "public" | "private" | "office" | "unknown";

export type NetworkDescription = {
  adapter: ConnectedAdapter | null;
  name: string | null;
  signal: number | null;
  security: string | null;
  openWifi: boolean;
  kind: NetworkKind;
  gateway: string | null;
  dns: string[];
};

const NETWORK_KIND_LABEL: Record<NetworkKind, string> = {
  public: "Public network",
  private: "Private network",
  office: "Company network",
  unknown: "Network type unknown",
};

export function networkKindLabel(kind: NetworkKind) {
  return NETWORK_KIND_LABEL[kind];
}

function sameAlias(a?: string, b?: string) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function describeNetwork(snapshot: NetworkSnapshot): NetworkDescription {
  const adapters = connectedAdapters(snapshot.interfaces);
  const adapter = adapters.find((a) => a.kind !== "vpn") ?? adapters[0] ?? null;
  const ctx = snapshot.context ?? {};

  const wifi =
    ctx.wifi?.find((w) => sameAlias(w.adapter, adapter?.name)) ??
    (adapter?.kind === "wifi" ? ctx.wifi?.[0] : undefined);

  const profile =
    ctx.profiles?.find((p) => sameAlias(p.alias, adapter?.name)) ?? ctx.profiles?.[0];

  const route =
    ctx.routes?.find((r) => sameAlias(r.alias, adapter?.name)) ?? ctx.routes?.[0];

  const category = (profile?.category ?? "").toLowerCase();
  const kind: NetworkKind = category.startsWith("domain")
    ? "office"
    : category === "private"
      ? "private"
      : category === "public"
        ? "public"
        : "unknown";

  // Windows names the connection profile after the Wi-Fi network,
  // so it's a good fallback when Location blocks netsh from showing the SSID.
  const name = wifi?.ssid || profile?.name || null;
  const security = wifi?.authentication ?? null;

  return {
    adapter,
    name,
    signal: wifi?.signal_percent ?? null,
    security,
    openWifi: !!security && /^open$/i.test(security.trim()),
    kind,
    gateway: route?.gateway ?? null,
    dns: route?.dns ?? [],
  };
}

export type AntivirusSummary = {
  state: "on" | "off" | "outdated" | "unknown";
  name: string | null;
  detail: string;
};

export function summarizeAntivirus(context: NetworkContext | null | undefined): AntivirusSummary {
  const products = context?.antivirus ?? [];
  const defender = context?.defender ?? null;

  const active = products.find((p) => p.enabled);
  const defenderOn = defender?.realtime === true && defender?.antivirus !== false;
  const age = defender?.signature_age_days;

  if (active || defenderOn) {
    const name = active?.name ?? "Microsoft Defender";
    const outdated =
      active?.up_to_date === false ||
      (defenderOn && !active && typeof age === "number" && age > 7);

    if (outdated) {
      return {
        state: "outdated",
        name,
        detail:
          typeof age === "number"
            ? `${name} is on, but its virus definitions are ${age} days old.`
            : `${name} is on, but its virus definitions are out of date.`,
      };
    }

    return { state: "on", name, detail: `${name} is protecting this device.` };
  }

  if (products.length > 0 || defender) {
    return {
      state: "off",
      name: products[0]?.name ?? "Microsoft Defender",
      detail: "No antivirus is actively protecting this device.",
    };
  }

  return { state: "unknown", name: null, detail: "Antivirus status not reported yet." };
}

// ---------------------------------------------------------
// Websites (agent 1.4.0+)
// ---------------------------------------------------------

export type DomainRisk = "risky" | "unnecessary" | "ok";

export type DomainRecord = {
  domain: string;
  category: string;
  category_label: string;
  risk: DomainRisk;
  reason: string | null;
  apps: string[];
  hits: number;
  first_seen: string;
  last_seen: string;
};

export type DomainReport = {
  device_id: string;
  hours: number;
  summary: { risky: number; unnecessary: number; ok: number; system: number; total: number };
  domains: DomainRecord[];
};

export type Site = {
  site: string;
  hostnames: string[];
  category: string;
  categoryLabel: string;
  risk: DomainRisk;
  reason: string | null;
  apps: string[];
  hits: number;
  lastSeen: string;
};

const SECOND_LEVEL = new Set([
  "co.in", "net.in", "org.in", "gov.in", "ac.in", "edu.in", "res.in", "firm.in",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au",
  "co.jp", "com.br", "com.sg", "com.my", "co.za", "com.cn", "com.hk", "co.nz",
]);

// Big platforms serve images and video from separate hostnames.
// Show them under the brand people recognise.
const BRAND_OF: Record<string, string> = {
  "ytimg.com": "youtube.com",
  "googlevideo.com": "youtube.com",
  "youtube-nocookie.com": "youtube.com",
  "youtu.be": "youtube.com",
  "fbcdn.net": "facebook.com",
  "fbsbx.com": "facebook.com",
  "fb.com": "facebook.com",
  "cdninstagram.com": "instagram.com",
  "twimg.com": "x.com",
  "twitter.com": "x.com",
  "t.co": "x.com",
  "tiktokcdn.com": "tiktok.com",
  "tiktokv.com": "tiktok.com",
  "tiktokcdn-eu.com": "tiktok.com",
  "redd.it": "reddit.com",
  "redditmedia.com": "reddit.com",
  "redditstatic.com": "reddit.com",
  "pinimg.com": "pinterest.com",
  "nflxvideo.net": "netflix.com",
  "nflximg.net": "netflix.com",
  "nflxso.net": "netflix.com",
  "nflxext.com": "netflix.com",
  "aiv-cdn.net": "primevideo.com",
  "aiv-delivery.net": "primevideo.com",
  "scdn.co": "spotify.com",
  "spotifycdn.com": "spotify.com",
  "ttvnw.net": "twitch.tv",
  "jtvnw.net": "twitch.tv",
  "steamstatic.com": "steampowered.com",
  "steamcommunity.com": "steampowered.com",
  "steamcontent.com": "steampowered.com",
  "rbxcdn.com": "roblox.com",
  "sndcdn.com": "soundcloud.com",
  "discordapp.com": "discord.com",
  "discordapp.net": "discord.com",
  "discord.gg": "discord.com",
  "licdn.com": "linkedin.com",
  "whatsapp.net": "whatsapp.com",
};

/** www.youtube.com -> youtube.com, abc.bbc.co.uk -> bbc.co.uk, i.ytimg.com -> youtube.com */
export function siteOf(domain: string): string {
  const labels = domain.toLowerCase().replace(/\.$/, "").split(".");
  let site = labels.join(".");
  if (labels.length > 2) {
    const lastTwo = labels.slice(-2).join(".");
    site = SECOND_LEVEL.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
  }
  return BRAND_OF[site] ?? site;
}

const RISK_RANK: Record<DomainRisk, number> = { risky: 0, unnecessary: 1, ok: 2 };

export function groupSites(domains: DomainRecord[]): Site[] {
  const sites = new Map<string, Site>();

  for (const d of domains) {
    const key = d.risk === "risky" ? d.domain : siteOf(d.domain);
    let s = sites.get(key);

    if (!s) {
      s = {
        site: key,
        hostnames: [],
        category: d.category,
        categoryLabel: d.category_label,
        risk: d.risk,
        reason: d.reason,
        apps: [],
        hits: 0,
        lastSeen: d.last_seen,
      };
      sites.set(key, s);
    }

    s.hostnames.push(d.domain);
    s.hits += d.hits;
    for (const app of d.apps) if (!s.apps.includes(app)) s.apps.push(app);
    if (new Date(d.last_seen) > new Date(s.lastSeen)) s.lastSeen = d.last_seen;

    // A site takes the worst classification of any of its hostnames.
    const worse = RISK_RANK[d.risk] < RISK_RANK[s.risk];
    const moreSpecific =
      d.risk === s.risk && (s.category === "other" || s.category === "system") && d.category !== "other";

    if (worse || moreSpecific) {
      s.risk = d.risk;
      s.category = d.category;
      s.categoryLabel = d.category_label;
      s.reason = d.reason;
    }
  }

  return [...sites.values()].sort(
    (a, b) => RISK_RANK[a.risk] - RISK_RANK[b.risk] || b.hits - a.hits,
  );
}

// ---------------------------------------------------------
// Verdict
// ---------------------------------------------------------

export type DeviceAssessment = {
  verdict: Verdict;
  headline: string;
  // Things the admin should act on, worst first.
  problems: Finding[];
  // Short reassurances shown as green chips.
  goodNews: string[];
};

const STALE_AFTER_MINUTES = 60;

export function firewallState(
  posture: FirewallPosture | null,
): "on" | "partly-off" | "public-off" | "unknown" {
  if (!posture || !posture.available) return "unknown";
  if (posture.public_enabled === false) return "public-off";
  if (posture.private_enabled === false || posture.domain_enabled === false) {
    return "partly-off";
  }
  return "on";
}

export function assessDevice(
  snapshot: NetworkSnapshot | null,
  now: Date = new Date(),
  domains: DomainReport | null = null,
): DeviceAssessment {
  if (!snapshot) {
    return {
      verdict: "unknown",
      headline: "No report from this device yet",
      problems: [],
      goodNews: [],
    };
  }

  const problems: Finding[] = [];
  const goodNews: string[] = [];

  // Freshness
  const collected = new Date(snapshot.collected_at);
  const ageMinutes = (now.getTime() - collected.getTime()) / 60000;
  if (!Number.isNaN(ageMinutes) && ageMinutes > STALE_AFTER_MINUTES) {
    problems.push({
      severity: "info",
      title: "Out of date",
      detail: `Last report was ${relativeTime(collected, now)}. The device may be offline.`,
    });
  }

  const net = describeNetwork(snapshot);

  // Wi-Fi without a password
  if (net.openWifi) {
    problems.push({
      severity: "warn",
      title: "On an open Wi-Fi network",
      detail: `${net.name ?? "This Wi-Fi"} has no password, so others nearby can see unencrypted traffic.`,
    });
  }

  // Firewall
  const fwState = firewallState(snapshot.firewall_posture);
  const fw = summarizeFirewall(snapshot.firewall_posture);
  const posture = snapshot.firewall_posture;
  const offForThisNetwork =
    (net.kind === "public" && posture?.public_enabled === false) ||
    (net.kind === "private" && posture?.private_enabled === false) ||
    (net.kind === "office" && posture?.domain_enabled === false);

  if (offForThisNetwork) {
    problems.push({
      severity: "risk",
      title: "Firewall is off on this network",
      detail: `The firewall is switched off for ${networkKindLabel(net.kind).toLowerCase()}s, which is what this device is on right now.`,
    });
  } else if (fwState === "on") {
    goodNews.push("Firewall on");
  } else if (fwState === "unknown") {
    problems.push({
      severity: "info",
      title: "Couldn't read the firewall",
      detail: "The agent didn't get an answer from Windows this time. It will try again on the next report.",
    });
  } else {
    // Off for a network type the device isn't on right now: worth fixing,
    // but not an immediate risk.
    const onOtherNetwork = net.kind === "private" || net.kind === "office";
    problems.push({
      severity: onOtherNetwork ? "warn" : fw.severity,
      title: fw.headline,
      detail: fw.detail,
    });
  }

  // Antivirus
  const av = summarizeAntivirus(snapshot.context);
  if (av.state === "on") {
    goodNews.push("Antivirus on");
  } else if (av.state === "off") {
    problems.push({ severity: "risk", title: "Antivirus is off", detail: av.detail });
  } else if (av.state === "outdated") {
    problems.push({ severity: "warn", title: "Antivirus is out of date", detail: av.detail });
  }

  // Open doors: only escalate when we KNOW the firewall is off.
  const firewallKnownOff = fwState === "public-off" || fwState === "partly-off";
  const doors = openDoors(snapshot.listeners).filter((d) => d.reachableFromNetwork);
  const risky = doors.filter((d) => d.info.exposure === "risky");

  if (risky.length > 0) {
    const names = risky.slice(0, 3).map((d) => d.info.name);
    problems.push({
      severity: firewallKnownOff ? "risk" : "warn",
      title:
        risky.length === 1
          ? `${names[0]} is open to other computers`
          : `${risky.length} remote-access services are open`,
      detail: firewallKnownOff
        ? `${joinWords(names)} can be reached from the network and the firewall is off. Turn the firewall on or switch these off.`
        : `${joinWords(names)} can be reached from the network. Make sure this is intended.`,
    });
  } else {
    goodNews.push("No remote-access services open");
  }

  // Outbound
  const flags = flaggedConnections(snapshot.connections);
  const serious = flags.filter((f) => f.severity === "risk");
  const unusual = flags.filter((f) => f.severity === "warn");

  if (serious.length > 0) {
    problems.push({
      severity: "risk",
      title: `${serious.length} suspicious connection${serious.length > 1 ? "s" : ""}`,
      detail: `${serious[0].app}: ${serious[0].reason}.`,
    });
  }

  if (unusual.length > 0) {
    problems.push({
      severity: "warn",
      title: `${unusual.length} unusual connection${unusual.length > 1 ? "s" : ""}`,
      detail: "An app we couldn't identify is talking to the internet on an uncommon port.",
    });
  }

  if (serious.length === 0 && unusual.length === 0) {
    goodNews.push("No suspicious connections");
  }

  // Websites
  if (domains) {
    const sites = groupSites(domains.domains).filter((x) => x.category !== "system");
    const risky = sites.filter((x) => x.risk === "risky");
    const unnecessary = sites.filter((x) => x.risk === "unnecessary");

    if (risky.length > 0) {
      problems.push({
        severity: "risk",
        title:
          risky.length === 1
            ? `Visited a dangerous site: ${risky[0].site}`
            : `Visited ${risky.length} dangerous sites`,
        detail: `${risky[0].reason ?? "Listed as dangerous"}. Check this device for malware.`,
      });
    } else {
      goodNews.push("No dangerous websites");
    }

    if (unnecessary.length > 0) {
      const names = unnecessary.slice(0, 3).map((x) => x.site);
      const more = unnecessary.length - names.length;
      problems.push({
        severity: "warn",
        title: `${unnecessary.length} non-work site${unnecessary.length > 1 ? "s" : ""} in the last ${domains.hours} hours`,
        detail: `${joinWords(names)}${more > 0 ? ` and ${more} more` : ""}.`,
      });
    }
  }

  const order = { risk: 0, warn: 1, info: 2, good: 3 };
  problems.sort((a, b) => order[a.severity] - order[b.severity]);

  if (problems.some((f) => f.severity === "risk")) {
    return { verdict: "risk", headline: "This device is at risk", problems, goodNews };
  }

  if (problems.some((f) => f.severity === "warn")) {
    return { verdict: "attention", headline: "This device needs a look", problems, goodNews };
  }

  return { verdict: "safe", headline: "This device looks safe", problems, goodNews };
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
