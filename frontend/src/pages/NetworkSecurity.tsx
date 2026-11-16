import { useCallback, useEffect, useMemo, useState } from "react";

import { getAgents, type Agent } from "../api";

import {
  ADAPTER_LABEL,
  addressScope,
  appActivity,
  assessDevice,
  connectedAdapters,
  describeRemotePort,
  extractAddresses,
  flaggedConnections,
  openDoors,
  relativeTime,
  summarizeFirewall,
  type ConnectedAdapter,
  type FirewallPosture,
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
      <header className="ns-header">
        <div>
          <h2>Network safety</h2>
          <p>
            See which network each device is on, whether it is protected, and
            what it is talking to.
          </p>
        </div>

        <button
          type="button"
          className="ns-button"
          onClick={refreshAll}
          disabled={deviceLoading}
        >
          <Icon name="refresh" />
          {deviceLoading ? "Checking…" : "Check again"}
        </button>
      </header>

      <OrgSummary overview={overview} error={overviewError} />

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
                findings={assessment.findings}
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

  const silent = overview.total_devices - overview.reporting_devices;

  return (
    <p className="ns-org">
      <span>
        <b>{overview.reporting_devices}</b> of {overview.total_devices} devices
        sending network reports
        {silent > 0 && (
          <>
            {" "}
            (<b>{silent}</b> not reporting yet)
          </>
        )}
        .
      </span>{" "}
      {overview.firewall_disabled_snapshots > 0 ? (
        <span className="ns-text-warn">
          {overview.firewall_disabled_snapshots} report
          {overview.firewall_disabled_snapshots > 1 ? "s" : ""} showed a
          firewall switched off.
        </span>
      ) : (
        <span className="ns-text-good">No reports with the firewall off.</span>
      )}
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
  findings,
  checkedAt,
  now,
}: {
  hostname: string;
  verdict: Verdict;
  headline: string;
  findings: { severity: Severity; title: string; detail: string }[];
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
          <p className="ns-verdict-device">{hostname}</p>
          <h3>{headline}</h3>
          {checkedAt && (
            <p className="ns-muted">
              Last checked {relativeTime(new Date(checkedAt), now)} ·{" "}
              {formatTime(checkedAt)}
            </p>
          )}
        </div>
      </div>

      <ul className="ns-findings">
        {findings.map((f) => (
          <li key={f.title} className={`is-${f.severity}`}>
            <SeverityMark severity={f.severity} />
            <div>
              <strong>{f.title}</strong>
              <span>{f.detail}</span>
            </div>
          </li>
        ))}
      </ul>
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
  const primary = adapters.find((a) => a.kind !== "vpn") ?? adapters[0];
  const vpn = adapters.find((a) => a.kind === "vpn");

  const talksToInternet = snapshot.connections.some(
    (c) => addressScope(c.remote_address) === "internet",
  );

  return (
    <section className="ns-card">
      <SectionHead
        title="Where it's connected"
        hint="How this device reaches the internet right now."
      />

      {!primary ? (
        <p className="ns-muted">
          No active network connection was found in the last report. The device
          may be offline or only using virtual adapters.
        </p>
      ) : (
        <>
          <ol className="ns-chain" aria-label="Connection path">
            <ChainNode icon="laptop" title={hostname} sub="This device" />
            <ChainNode
              icon={ADAPTER_ICON[primary.kind]}
              title={ADAPTER_LABEL[primary.kind]}
              sub={primary.name}
            />
            {vpn && (
              <ChainNode icon="lock" title="VPN tunnel" sub={vpn.name} tone="good" />
            )}
            <ChainNode
              icon="router"
              title="Local network"
              sub={primary.ipv4 ?? "No address"}
            />
            <ChainNode
              icon="globe"
              title="Internet"
              sub={talksToInternet ? "Reachable" : "No traffic seen"}
              tone={talksToInternet ? undefined : "muted"}
            />
          </ol>

          <p className="ns-plain">
            Connected by <b>{ADAPTER_LABEL[primary.kind].toLowerCase()}</b>
            {primary.speedMbps ? ` at ${formatSpeed(primary.speedMbps)}` : ""}
            , with the local address <b>{primary.ipv4}</b>.{" "}
            {vpn
              ? "Traffic also goes through a VPN, which hides it from the local network."
              : "No VPN is in use."}
            {adapters.length > 1 &&
              ` ${adapters.length} network adapters are active.`}
          </p>
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
      <strong>{title}</strong>
      <small title={sub}>{sub}</small>
    </li>
  );
}

// ---------------------------------------------------------
// Protection
// ---------------------------------------------------------

function ProtectionSection({ snapshot }: { snapshot: NetworkSnapshot }) {
  const fw = summarizeFirewall(snapshot.firewall_posture);
  const doors = openDoors(snapshot.listeners);
  const exposed = doors.filter((d) => d.reachableFromNetwork);
  const internalOnly = doors.length - exposed.length;
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? exposed : exposed.slice(0, 6);

  return (
    <section className="ns-card">
      <SectionHead
        title="Protection"
        hint="Is the device shielded from other computers on the network?"
      />

      <div className="ns-protect-grid">
        <div className={`ns-firewall is-${fw.severity}`}>
          <div className="ns-firewall-head">
            <Icon name="firewall" />
            <div>
              <strong>{fw.headline}</strong>
              <span>{fw.detail}</span>
            </div>
          </div>

          <FirewallProfiles posture={snapshot.firewall_posture} />
        </div>

        <div className="ns-doors">
          <h4>Open doors</h4>
          <p className="ns-muted">
            Services on this device that other computers can connect to.
            {internalOnly > 0 &&
              ` ${internalOnly} more only accept connections from the device itself, which is safe.`}
          </p>

          {exposed.length === 0 ? (
            <EmptyGood text="Nothing on this device accepts connections from the network." />
          ) : (
            <>
              <ul className="ns-door-list">
                {visible.map((d) => (
                  <li key={`${d.protocol}-${d.port}`} className={`is-${d.info.exposure}`}>
                    <div>
                      <strong>{d.info.name}</strong>
                      <span>
                        {d.info.meaning} · {d.apps.join(", ")}
                      </span>
                    </div>
                    <span className="ns-pill">
                      {d.info.exposure === "risky"
                        ? "Sensitive"
                        : d.info.exposure === "review"
                          ? "Check"
                          : "Normal"}
                    </span>
                  </li>
                ))}
              </ul>
              {exposed.length > 6 && (
                <button
                  type="button"
                  className="ns-link"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "Show fewer" : `Show all ${exposed.length}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function FirewallProfiles({ posture }: { posture: FirewallPosture | null }) {
  if (!posture?.available) return null;

  const rows: [string, boolean | null][] = [
    ["Public Wi-Fi", posture.public_enabled],
    ["Home & trusted", posture.private_enabled],
    ["Company network", posture.domain_enabled],
  ];

  return (
    <ul className="ns-profiles">
      {rows.map(([label, enabled]) => (
        <li
          key={label}
          className={enabled === true ? "is-on" : enabled === false ? "is-off" : ""}
        >
          <span>{label}</span>
          <b>{enabled === true ? "On" : enabled === false ? "Off" : "Unknown"}</b>
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
  const max = Math.max(1, ...apps.map((a) => a.internet + a.localNetwork));
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? apps : apps.slice(0, 8);

  return (
    <section className="ns-card">
      <SectionHead
        title="What it's talking to"
        hint="Apps on this device that have open connections right now."
      />

      <div className="ns-activity-grid">
        <div>
          <h4>Apps using the network</h4>
          {apps.length === 0 ? (
            <p className="ns-muted">No apps had open connections at the last check.</p>
          ) : (
            <>
              <ul className="ns-apps">
                {visible.map((a) => {
                  const total = a.internet + a.localNetwork;
                  return (
                    <li key={a.app} className={a.flagged ? "is-flagged" : ""}>
                      <div className="ns-app-row">
                        <strong>{prettyApp(a.app)}</strong>
                        <span>
                          {a.destinations} destination{a.destinations === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div
                        className="ns-bar"
                        role="img"
                        aria-label={`${a.internet} internet and ${a.localNetwork} local connections`}
                      >
                        <span
                          className="ns-bar-internet"
                          style={{ width: `${(a.internet / max) * 100}%` }}
                        />
                        <span
                          className="ns-bar-local"
                          style={{ width: `${(a.localNetwork / max) * 100}%` }}
                        />
                      </div>
                      <small>
                        {a.internet > 0 && `${a.internet} to the internet`}
                        {a.internet > 0 && a.localNetwork > 0 && " · "}
                        {a.localNetwork > 0 && `${a.localNetwork} on the local network`}
                        {total === 0 && "Idle"}
                      </small>
                    </li>
                  );
                })}
              </ul>
              {apps.length > 8 && (
                <button
                  type="button"
                  className="ns-link"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "Show fewer" : `Show all ${apps.length} apps`}
                </button>
              )}
            </>
          )}
        </div>

        <div>
          <h4>Things to check</h4>
          {flags.length === 0 ? (
            <EmptyGood text="Nothing suspicious. Every connection uses normal, expected channels." />
          ) : (
            <ul className="ns-flags">
              {flags.slice(0, 8).map((f) => (
                <li key={`${f.app}-${f.remote}-${f.port}`} className={`is-${f.severity}`}>
                  <SeverityMark severity={f.severity} />
                  <div>
                    <strong>{prettyApp(f.app)}</strong>
                    <span>{f.reason}</span>
                    <small>
                      {f.remote} · {describeRemotePort(f.port)}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="ns-note">
            Website names and a safe/unsafe site check are coming in the next
            agent update. Today this view works from connection addresses.
          </p>
        </div>
      </div>
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
        title="Recent reports"
        hint={`The last ${items.length} network reports, oldest on the left. Bar height is how busy the device was.`}
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
      <h3>{title}</h3>
      <p>{hint}</p>
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
