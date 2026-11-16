import { useCallback, useEffect, useMemo, useState } from "react";

import { getAgents, type Agent } from "../api";

import {
  ADAPTER_LABEL,
  addressScope,
  appActivity,
  assessDevice,
  connectedAdapters,
  describeNetwork,
  describeRemotePort,
  extractAddresses,
  firewallState,
  flaggedConnections,
  isLiveConnection,
  networkKindLabel,
  openDoors,
  relativeTime,
  summarizeAntivirus,
  type AntivirusSummary,
  type ConnectedAdapter,
  type FirewallPosture,
  type NetworkKind,
  type NetworkSnapshot,
  type Severity,
  type Verdict,
} from "./networkInsights";

import "./NetworkSecurity.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

const AUTO_REFRESH_MS = 60_000;

// ---------------------------------------------------------
// API types (unchanged backend contract)
// ---------------------------------------------------------

type NetworkOverview = {
  organization_id: number;
  total_devices: number;
  reporting_devices: number;
  total_interfaces: number;
  total_connections: number;
  total_listeners: number;
  firewall_disabled_snapshots: number;
  latest_snapshot: {
    id: number;
    device_id: string;
    collected_at: string;
  } | null;
};

type NetworkDeviceDetails = {
  device: {
    device_id: string;
    hostname: string;
    operating_system: string;
    os_version: string;
    agent_version: string;
    last_seen: string;
  };
  snapshot: NetworkSnapshot | null;
};

type NetworkSnapshotHistoryItem = {
  id: number;
  collected_at: string;
  interfaces: number;
  connections: number;
  listeners: number;
  firewall_available: boolean;
  firewall_domain_enabled: boolean | null;
  firewall_private_enabled: boolean | null;
  firewall_public_enabled: boolean | null;
};

type NetworkSnapshotHistory = {
  device_id: string;
  snapshots: NetworkSnapshotHistoryItem[];
};

type NetworkSecurityProps = {
  token: string;
};

async function fetchJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const body = await response.json();
      if (body && typeof body.detail === "string") message = body.detail;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------
// Page
// ---------------------------------------------------------

function NetworkSecurity({ token }: NetworkSecurityProps) {
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [devices, setDevices] = useState<Agent[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [deviceFilter, setDeviceFilter] = useState("");

  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [details, setDetails] = useState<NetworkDeviceDetails | null>(null);
  const [history, setHistory] = useState<NetworkSnapshotHistory | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [now, setNow] = useState(() => new Date());

  const loadOverview = useCallback(async () => {
    setOverviewError(null);
    try {
      setOverview(
        await fetchJson<NetworkOverview>("/api/v1/security/network/overview", token),
      );
    } catch (error) {
      setOverviewError(
        error instanceof Error ? error.message : "Could not load the summary.",
      );
    }
  }, [token]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const data = await getAgents(token);
      setDevices(data);
      setSelectedDeviceId((current) => current ?? data[0]?.device_id ?? null);
    } catch (error) {
      setDeviceError(
        error instanceof Error ? error.message : "Could not load devices.",
      );
    } finally {
      setDevicesLoading(false);
    }
  }, [token]);

  const loadDevice = useCallback(
    async (deviceId: string, quiet = false) => {
      if (!quiet) setDeviceLoading(true);
      setDeviceError(null);

      const id = encodeURIComponent(deviceId);

      try {
        const [d, h] = await Promise.all([
          fetchJson<NetworkDeviceDetails>(
            `/api/v1/security/network/devices/${id}`,
            token,
          ),
          fetchJson<NetworkSnapshotHistory>(
            `/api/v1/security/network/devices/${id}/snapshots`,
            token,
          ),
        ]);
        setDetails(d);
        setHistory(h);
        setNow(new Date());
      } catch (error) {
        if (!quiet) {
          setDetails(null);
          setHistory(null);
        }
        setDeviceError(
          error instanceof Error
            ? error.message
            : "Could not load this device's network report.",
        );
      } finally {
        if (!quiet) setDeviceLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void loadOverview();
    void loadDevices();
  }, [loadOverview, loadDevices]);

  useEffect(() => {
    if (!selectedDeviceId) return;

    void loadDevice(selectedDeviceId);

    const timer = window.setInterval(() => {
      void loadDevice(selectedDeviceId, true);
      void loadOverview();
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [selectedDeviceId, loadDevice, loadOverview]);

  const refreshAll = () => {
    void loadOverview();
    if (selectedDeviceId) void loadDevice(selectedDeviceId);
  };

  const snapshot = details?.snapshot ?? null;

  const assessment = useMemo(
    () => assessDevice(snapshot, now),
    [snapshot, now],
  );

  const filteredDevices = useMemo(() => {
    const q = deviceFilter.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(
      (d) =>
        d.hostname.toLowerCase().includes(q) ||
        d.device_id.toLowerCase().includes(q),
    );
  }, [devices, deviceFilter]);

  const selectedDevice =
    devices.find((d) => d.device_id === selectedDeviceId) ?? null;

  return (
    <section className="ns-page">
      <div className="ns-topline">
        <OrgSummary overview={overview} error={overviewError} />

        <button
          type="button"
          className="ns-button"
          onClick={refreshAll}
          disabled={deviceLoading}
        >
          <Icon name="refresh" />
          {deviceLoading ? "Checking…" : "Check again"}
        </button>
      </div>

      <div className="ns-layout">
        {/* ---------------- Device rail ---------------- */}
        <aside className="ns-rail" aria-label="Devices">
          <div className="ns-rail-head">
            <h3>Devices</h3>
            <span>{devices.length}</span>
          </div>

          {devices.length > 6 && (
            <input
              className="ns-search"
              type="search"
              placeholder="Find a device"
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
            />
          )}

          {devicesLoading ? (
            <p className="ns-muted">Loading devices…</p>
          ) : devices.length === 0 ? (
            <p className="ns-muted">
              No devices yet. Install the TechAIPILOT agent on a PC to see it
              here.
            </p>
          ) : (
            <ul className="ns-device-list">
              {filteredDevices.map((device) => {
                const selected = device.device_id === selectedDeviceId;
                return (
                  <li key={device.device_id}>
                    <button
                      type="button"
                      className={`ns-device ${selected ? "is-selected" : ""}`}
                      aria-current={selected ? "true" : undefined}
                      onClick={() => setSelectedDeviceId(device.device_id)}
                    >
                      <Icon name="laptop" />
                      <span>
                        <strong>{device.hostname}</strong>
                        <small>{device.operating_system}</small>
                      </span>
                      {selected && (
                        <VerdictDot verdict={assessment.verdict} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ---------------- Device report ---------------- */}
        <div className="ns-main">
          {deviceError && (
            <div className="ns-alert" role="alert">
              <strong>Could not load this device's report.</strong>
              <span>{deviceError}</span>
            </div>
          )}

          {!selectedDevice && !devicesLoading ? null : deviceLoading &&
            !details ? (
            <div className="ns-card ns-placeholder">
              Checking {selectedDevice?.hostname ?? "device"}…
            </div>
          ) : (
            <>
              <VerdictBanner
                hostname={details?.device.hostname ?? selectedDevice?.hostname ?? ""}
                verdict={assessment.verdict}
                headline={assessment.headline}
                problems={assessment.problems}
                goodNews={assessment.goodNews}
                checkedAt={snapshot?.collected_at ?? null}
                now={now}
              />

              {snapshot && (
                <>
                  <ConnectionSection
                    hostname={details?.device.hostname ?? ""}
                    snapshot={snapshot}
                  />

                  <ProtectionSection snapshot={snapshot} />

                  <ActivitySection snapshot={snapshot} />

                  <HistorySection history={history} now={now} />

                  <AdvancedSection snapshot={snapshot} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default NetworkSecurity;

// ---------------------------------------------------------
// Organisation summary
// ---------------------------------------------------------

function OrgSummary({
  overview,
  error,
}: {
  overview: NetworkOverview | null;
  error: string | null;
}) {
  if (error) {
    return <p className="ns-org ns-muted">Summary unavailable: {error}</p>;
  }

  if (!overview) return <p className="ns-org ns-muted">Loading summary…</p>;

  // The backend can over-count reporting devices; never show "4 of 2".
  const total = overview.total_devices;
  const reporting = Math.min(overview.reporting_devices, total);

  return (
    <p className="ns-org">
      <b>{reporting}</b> of <b>{total}</b> device{total === 1 ? "" : "s"}{" "}
      reporting
      {overview.firewall_disabled_snapshots > 0 ? (
        <span className="ns-text-warn">
          {" "}
          · firewall was off in {overview.firewall_disabled_snapshots} report
          {overview.firewall_disabled_snapshots > 1 ? "s" : ""}
        </span>
      ) : null}
    </p>
  );
}

// ---------------------------------------------------------
// Verdict
// ---------------------------------------------------------

const VERDICT_ICON: Record<Verdict, IconName> = {
  safe: "shield-check",
  attention: "shield-alert",
  risk: "shield-x",
  unknown: "shield",
};

function VerdictBanner({
  hostname,
  verdict,
  headline,
  problems,
  goodNews,
  checkedAt,
  now,
}: {
  hostname: string;
  verdict: Verdict;
  headline: string;
  problems: { severity: Severity; title: string; detail: string }[];
  goodNews: string[];
  checkedAt: string | null;
  now: Date;
}) {
  return (
    <section className={`ns-verdict is-${verdict}`} aria-live="polite">
      <div className="ns-verdict-head">
        <span className="ns-verdict-icon">
          <Icon name={VERDICT_ICON[verdict]} />
        </span>
        <div>
          <h3>{headline}</h3>
          <p className="ns-muted">
            {hostname}
            {checkedAt
              ? ` · checked ${relativeTime(new Date(checkedAt), now)}`
              : " · waiting for the agent's first report"}
          </p>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="ns-problems">
          {problems.map((f) => (
            <li key={f.title}>
              <SeverityMark severity={f.severity} />
              <div>
                <strong>{f.title}</strong>
                <span>{f.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {goodNews.length > 0 && (
        <ul className="ns-chips" aria-label="What's fine">
          {goodNews.map((g) => (
            <li key={g}>
              <Icon name="check" />
              {g}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------
// Where is it connected
// ---------------------------------------------------------

const ADAPTER_ICON: Record<ConnectedAdapter["kind"], IconName> = {
  wifi: "wifi",
  ethernet: "ethernet",
  vpn: "lock",
  virtual: "chip",
  other: "chip",
};

function ConnectionSection({
  hostname,
  snapshot,
}: {
  hostname: string;
  snapshot: NetworkSnapshot;
}) {
  const adapters = connectedAdapters(snapshot.interfaces);
  const vpn = adapters.find((a) => a.kind === "vpn");
  const net = describeNetwork(snapshot);
  const primary = net.adapter;

  const online = snapshot.connections.some(
    (c) => isLiveConnection(c) && addressScope(c.remote_address) === "internet",
  );

  const linkSub = [
    net.signal !== null ? `Signal ${net.signal}%` : null,
    !net.signal && primary?.speedMbps ? formatSpeed(primary.speedMbps) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const kindTone: Record<NetworkKind, string> = {
    public: "warn",
    private: "good",
    office: "good",
    unknown: "info",
  };

  return (
    <section className="ns-card">
      <div className="ns-card-head">
        <h3 className="ns-card-title">Connection</h3>
        {primary && net.kind !== "unknown" && (
          <span className={`ns-status is-${kindTone[net.kind]}`}>
            {networkKindLabel(net.kind)}
          </span>
        )}
      </div>

      {!primary ? (
        <p className="ns-muted">
          No active network connection in the last report. The device may be
          offline.
        </p>
      ) : (
        <>
          <ol className="ns-chain" aria-label="Connection path">
            <ChainNode icon="laptop" title={hostname} sub={primary.ipv4 ?? "This device"} />
            <ChainNode
              icon={ADAPTER_ICON[primary.kind]}
              title={net.name ?? ADAPTER_LABEL[primary.kind]}
              sub={linkSub || ADAPTER_LABEL[primary.kind]}
            />
            {vpn && <ChainNode icon="lock" title="VPN" sub="Traffic hidden" tone="good" />}
            <ChainNode
              icon="router"
              title="Router"
              sub={net.gateway ?? "Address not reported"}
              tone={net.gateway ? undefined : "muted"}
            />
            <ChainNode
              icon="globe"
              title="Internet"
              sub={online ? "Online" : "No traffic"}
              tone={online ? undefined : "muted"}
            />
          </ol>

          {(net.security || net.dns.length > 0) && (
            <dl className="ns-facts">
              {net.security && (
                <div>
                  <dt>Wi-Fi security</dt>
                  <dd className={net.openWifi ? "ns-text-warn" : undefined}>
                    {net.openWifi ? "None (open network)" : net.security}
                  </dd>
                </div>
              )}
              {net.dns.length > 0 && (
                <div>
                  <dt>Name lookups (DNS)</dt>
                  <dd>{net.dns.slice(0, 2).join(", ")}</dd>
                </div>
              )}
            </dl>
          )}

          {!snapshot.context && (
            <p className="ns-note">
              Wi-Fi name, router and network type appear once this device runs
              agent 1.3.0 or later.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ChainNode({
  icon,
  title,
  sub,
  tone,
}: {
  icon: IconName;
  title: string;
  sub: string;
  tone?: "good" | "muted";
}) {
  return (
    <li className={`ns-chain-node ${tone ? `is-${tone}` : ""}`}>
      <span className="ns-chain-icon">
        <Icon name={icon} />
      </span>
      <strong title={title}>{title}</strong>
      <small title={sub}>{sub}</small>
    </li>
  );
}

// ---------------------------------------------------------
// Protection
// ---------------------------------------------------------

function ProtectionSection({ snapshot }: { snapshot: NetworkSnapshot }) {
  const state = firewallState(snapshot.firewall_posture);
  const av = summarizeAntivirus(snapshot.context);
  const avTone: Record<AntivirusSummary["state"], Severity> = {
    on: "good",
    outdated: "warn",
    off: "risk",
    unknown: "info",
  };
  const doors = openDoors(snapshot.listeners).filter(
    (d) => d.reachableFromNetwork && d.info.exposure !== "normal",
  );

  const fwText: Record<typeof state, { label: string; tone: Severity }> = {
    on: { label: "On", tone: "good" },
    "partly-off": { label: "Partly off", tone: "warn" },
    "public-off": { label: "Off on public Wi-Fi", tone: "risk" },
    unknown: { label: "Couldn't check", tone: "info" },
  };

  return (
    <section className="ns-card">
      <h3 className="ns-card-title">Protection</h3>

      <div className="ns-row">
        <span className="ns-row-label">
          <Icon name="firewall" /> Firewall
        </span>
        <span className={`ns-status is-${fwText[state].tone}`}>{fwText[state].label}</span>
      </div>

      {state !== "unknown" && <FirewallProfiles posture={snapshot.firewall_posture} />}

      {av.state !== "unknown" && (
        <div className="ns-row ns-row-top">
          <span className="ns-row-label">
            <Icon name="shield" /> Antivirus
          </span>
          <span className={`ns-status is-${avTone[av.state]}`} title={av.detail}>
            {av.state === "on" ? av.name : av.state === "outdated" ? "Out of date" : "Off"}
          </span>
        </div>
      )}

      <div className="ns-row ns-row-top">
        <span className="ns-row-label">
          <Icon name="door" /> Open to other computers
        </span>
        <span className={`ns-status is-${doors.length ? "warn" : "good"}`}>
          {doors.length ? doors.length : "None"}
        </span>
      </div>

      {doors.length > 0 && (
        <ul className="ns-door-list">
          {doors.map((d) => (
            <li key={`${d.info.name}-${d.port}`} className={`is-${d.info.exposure}`}>
              <strong>{d.info.name}</strong>
              <span>{d.info.meaning}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FirewallProfiles({ posture }: { posture: FirewallPosture | null }) {
  if (!posture?.available) return null;

  const rows: [string, boolean | null][] = [
    ["Public Wi-Fi", posture.public_enabled],
    ["Home", posture.private_enabled],
    ["Office", posture.domain_enabled],
  ];

  return (
    <ul className="ns-profiles">
      {rows.map(([label, enabled]) => (
        <li key={label} className={enabled === false ? "is-off" : enabled ? "is-on" : ""}>
          {label} <b>{enabled === true ? "on" : enabled === false ? "off" : "?"}</b>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------
// What it's talking to
// ---------------------------------------------------------

function ActivitySection({ snapshot }: { snapshot: NetworkSnapshot }) {
  const apps = appActivity(snapshot.connections);
  const flags = flaggedConnections(snapshot.connections);
  const concerns = flags.filter((f) => f.severity === "risk" || f.severity === "warn");
  const plainWeb = flags.filter((f) => f.severity === "info").length;
  const max = Math.max(1, ...apps.map((a) => a.internet + a.localNetwork));
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? apps : apps.slice(0, 6);

  return (
    <section className="ns-card">
      <h3 className="ns-card-title">Activity</h3>

      {concerns.length === 0 ? (
        <EmptyGood text="Nothing suspicious. All apps are using normal internet channels." />
      ) : (
        <ul className="ns-flags">
          {concerns.slice(0, 5).map((f) => (
            <li key={`${f.app}-${f.remote}-${f.port}`}>
              <SeverityMark severity={f.severity} />
              <div>
                <strong>
                  {prettyApp(f.app)}: {f.reason}
                </strong>
                <small>
                  {f.remote} · {describeRemotePort(f.port)}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h4 className="ns-subtitle">Apps online right now</h4>

      {apps.length === 0 ? (
        <p className="ns-muted">No apps had open connections at the last check.</p>
      ) : (
        <>
          <ul className="ns-apps">
            {visible.map((a) => {
              const total = a.internet + a.localNetwork;
              return (
                <li key={a.app}>
                  <strong title={a.app}>{prettyApp(a.app)}</strong>
                  <span className="ns-bar" aria-hidden="true">
                    <span style={{ width: `${(total / max) * 100}%` }} />
                  </span>
                  <span className="ns-count">{total}</span>
                </li>
              );
            })}
          </ul>

          <div className="ns-foot">
            {apps.length > 6 && (
              <button type="button" className="ns-link" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${apps.length} apps`}
              </button>
            )}
            {plainWeb > 0 && (
              <span className="ns-muted">
                {plainWeb === 1 ? "1 connection uses" : `${plainWeb} connections use`}{" "}
                unencrypted web. Usually harmless updates.
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------
// History
// ---------------------------------------------------------

function HistorySection({
  history,
  now,
}: {
  history: NetworkSnapshotHistory | null;
  now: Date;
}) {
  const items = [...(history?.snapshots ?? [])]
    .sort(
      (a, b) =>
        new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime(),
    )
    .slice(-48);

  if (items.length < 2) return null;

  const max = Math.max(1, ...items.map((s) => s.connections));
  const offCount = items.filter(isFirewallOff).length;

  return (
    <section className="ns-card">
      <SectionHead
        title="Last few hours"
        hint="Each bar is one report. Red means the firewall was off."
      />

      <div className="ns-history" role="list">
        {items.map((s) => {
          const off = isFirewallOff(s);
          return (
            <span
              key={s.id}
              role="listitem"
              className={`ns-history-bar ${off ? "is-off" : ""}`}
              style={{ height: `${18 + (s.connections / max) * 82}%` }}
              title={`${formatTime(s.collected_at)} · ${s.connections} connections · firewall ${off ? "partly off" : "on"}`}
            />
          );
        })}
      </div>

      <div className="ns-history-axis">
        <span>{relativeTime(new Date(items[0].collected_at), now)}</span>
        <span>
          {offCount === 0
            ? "Firewall stayed on in every report."
            : `Firewall was off in ${offCount} of ${items.length} reports.`}
        </span>
        <span>{relativeTime(new Date(items[items.length - 1].collected_at), now)}</span>
      </div>
    </section>
  );
}

function isFirewallOff(s: NetworkSnapshotHistoryItem) {
  return (
    s.firewall_available &&
    (s.firewall_public_enabled === false ||
      s.firewall_private_enabled === false ||
      s.firewall_domain_enabled === false)
  );
}

// ---------------------------------------------------------
// Advanced (raw data)
// ---------------------------------------------------------

function AdvancedSection({ snapshot }: { snapshot: NetworkSnapshot }) {
  return (
    <details className="ns-card ns-advanced">
      <summary>
        <span>Technical details</span>
        <small>
          {snapshot.interfaces.length} adapters · {snapshot.connections.length}{" "}
          connections · {snapshot.listeners.length} listening ports
        </small>
      </summary>

      <h4>Network adapters</h4>
      <div className="ns-table-wrap">
        <table className="ns-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Speed</th>
              <th>MAC</th>
              <th>Addresses</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.interfaces.map((i) => (
              <tr key={i.id}>
                <td>{i.interface_name}</td>
                <td>{i.is_up ? "Up" : "Down"}</td>
                <td>{i.speed_mbps ? formatSpeed(i.speed_mbps) : "—"}</td>
                <td className="ns-mono">{i.mac_address ?? "—"}</td>
                <td className="ns-mono">
                  {extractAddresses(i.addresses).join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>Connections</h4>
      <div className="ns-table-wrap ns-table-tall">
        <table className="ns-table">
          <thead>
            <tr>
              <th>App</th>
              <th>Protocol</th>
              <th>Local</th>
              <th>Remote</th>
              <th>State</th>
              <th>PID</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.connections.map((c) => (
              <tr key={c.id}>
                <td>{c.process_name ?? "—"}</td>
                <td>{c.protocol}</td>
                <td className="ns-mono">{endpoint(c.local_address, c.local_port)}</td>
                <td className="ns-mono">{endpoint(c.remote_address, c.remote_port)}</td>
                <td>{c.status ?? "—"}</td>
                <td>{c.pid ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>Listening ports</h4>
      <div className="ns-table-wrap ns-table-tall">
        <table className="ns-table">
          <thead>
            <tr>
              <th>App</th>
              <th>Protocol</th>
              <th>Bound to</th>
              <th>PID</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.listeners.map((l) => (
              <tr key={l.id}>
                <td>{l.process_name ?? "—"}</td>
                <td>{l.protocol}</td>
                <td className="ns-mono">{endpoint(l.bind_address, l.port)}</td>
                <td>{l.pid ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------
// Small pieces
// ---------------------------------------------------------

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="ns-section-head">
      <h3 className="ns-card-title">{title}</h3>
      <p className="ns-muted">{hint}</p>
    </div>
  );
}

function EmptyGood({ text }: { text: string }) {
  return (
    <div className="ns-empty-good">
      <Icon name="check" />
      <span>{text}</span>
    </div>
  );
}

function SeverityMark({ severity }: { severity: Severity }) {
  const icon: Record<Severity, IconName> = {
    good: "check",
    info: "info",
    warn: "alert",
    risk: "x",
  };
  return (
    <span className={`ns-sev is-${severity}`} aria-hidden="true">
      <Icon name={icon[severity]} />
    </span>
  );
}

function VerdictDot({ verdict }: { verdict: Verdict }) {
  const label: Record<Verdict, string> = {
    safe: "Looks safe",
    attention: "Needs a look",
    risk: "At risk",
    unknown: "No report",
  };
  return (
    <span className={`ns-dot is-${verdict}`} title={label[verdict]}>
      <span className="ns-sr">{label[verdict]}</span>
    </span>
  );
}

function prettyApp(name: string) {
  return name.replace(/\.exe$/i, "");
}

function endpoint(address: string | null, port: number | null) {
  if (port === null) return address ?? "—";
  const a = address ?? "*";
  return a.includes(":") ? `[${a}]:${port}` : `${a}:${port}`;
}

function formatSpeed(mbps: number) {
  return mbps >= 1000 ? `${(mbps / 1000).toFixed(mbps % 1000 ? 1 : 0)} Gbps` : `${mbps} Mbps`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

// ---------------------------------------------------------
// Icons (inline, stroke-based, inherit currentColor)
// ---------------------------------------------------------

type IconName =
  | "refresh"
  | "laptop"
  | "wifi"
  | "ethernet"
  | "lock"
  | "router"
  | "globe"
  | "chip"
  | "firewall"
  | "door"
  | "shield"
  | "shield-check"
  | "shield-alert"
  | "shield-x"
  | "check"
  | "info"
  | "alert"
  | "x";

const ICON_PATHS: Record<IconName, string> = {
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  laptop: "M4 5h16v10H4zM2 19h20",
  wifi: "M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01",
  ethernet: "M6 3h12v8H6zM9 11v4M15 11v4M12 11v10M8 21h8M9 6v2M12 6v2M15 6v2",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  router: "M3 14h18v6H3zM7 17h.01M11 17h.01M17 14V8M14 6a4 4 0 0 1 6 0",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
  chip: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  firewall: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v5M15 10v5M9 15v4",
  door: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12h.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  "shield-check": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  "shield-alert": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 8v5M12 16h.01",
  "shield-x": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9.5 9.5l5 5M14.5 9.5l-5 5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01",
  alert: "M12 3l10 18H2zM12 10v4M12 17h.01",
  x: "M6 6l12 12M18 6L6 18",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="ns-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
