import { useEffect, useState } from "react";

import {
  getAgents,
  type Agent,
} from "../api";

import { formatDateTime } from "../lib/agentVersion";

import "../pages.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/+$/, "");

/* ================= TYPES ================= */

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

type NetworkInterface = {
  id: number;
  interface_name: string;
  mac_address: string | null;
  is_up: boolean;
  speed_mbps: number | null;
  addresses: unknown;
};

type NetworkConnection = {
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

type NetworkListener = {
  id: number;
  protocol: string;
  bind_address: string | null;
  port: number;
  pid: number | null;
  process_name: string | null;
};

type FirewallPosture = {
  available: boolean;
  domain_enabled: boolean | null;
  private_enabled: boolean | null;
  public_enabled: boolean | null;
  error: string | null;
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
  snapshot: {
    id: number;
    collected_at: string;
    interfaces: NetworkInterface[];
    connections: NetworkConnection[];
    listeners: NetworkListener[];
    firewall_posture: FirewallPosture | null;
  } | null;
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

type TabKey = "interfaces" | "connections" | "listeners" | "history";

type Finding = {
  severity: "high" | "medium";
  title: string;
  detail: string;
};

const RDP_PORT = 3389;

/* ================= HELPERS ================= */

function formatEndpoint(address: string | null, port: number | null) {
  if (!address && port == null) {
    return "—";
  }

  if (port == null) {
    return address || "—";
  }

  return `${address || "*"}:${port}`;
}

function formatAddresses(addresses: unknown) {
  if (!addresses) {
    return "—";
  }

  if (Array.isArray(addresses)) {
    return addresses
      .map((address) => {
        if (address && typeof address === "object") {
          const value = address as Record<string, unknown>;

          if (typeof value.address === "string") {
            return value.address;
          }
        }

        return String(address);
      })
      .join(", ");
  }

  return String(addresses);
}

function formatTimestamp(value: string | null | undefined) {
  return value ? formatDateTime(value) : "No telemetry yet";
}

// Findings derived from the latest snapshot (read-only observations).
function deriveFindings(details: NetworkDeviceDetails): Finding[] {
  const findings: Finding[] = [];
  const snapshot = details.snapshot;

  if (!snapshot) {
    return findings;
  }

  const posture = snapshot.firewall_posture;
  const profiles: Array<[string, boolean | null | undefined]> = [
    ["Domain", posture?.domain_enabled],
    ["Private", posture?.private_enabled],
    ["Public", posture?.public_enabled],
  ];

  for (const [name, enabled] of profiles) {
    if (enabled === false) {
      findings.push({
        severity: "high",
        title: `Firewall off on ${name} profile`,
        detail: `Windows Firewall reported the ${name} profile as disabled.`,
      });
    }
  }

  const rdp = snapshot.listeners.find((listener) => listener.port === RDP_PORT);

  if (rdp) {
    findings.push({
      severity: "medium",
      title: `RDP listening on port ${RDP_PORT}`,
      detail: `Bound to ${rdp.bind_address || "*"}${
        rdp.process_name ? ` by ${rdp.process_name}` : ""
      }. Make sure it is not reachable from untrusted networks.`,
    });
  }

  return findings;
}

/* ================= PAGE ================= */

function NetworkSecurity({ token }: NetworkSecurityProps) {
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [devices, setDevices] = useState<Agent[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [deviceDetails, setDeviceDetails] =
    useState<NetworkDeviceDetails | null>(null);
  const [snapshotHistory, setSnapshotHistory] =
    useState<NetworkSnapshotHistory | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("interfaces");

  const loadOverview = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/security/network/overview`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        let message = `Failed to load network overview: ${response.status}`;

        try {
          const body = await response.json();

          if (body && typeof body.detail === "string") {
            message = body.detail;
          }
        } catch {
          // Keep default error message.
        }

        throw new Error(message);
      }

      setOverview((await response.json()) as NetworkOverview);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load network security data.",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    setDevicesLoading(true);

    try {
      const data = await getAgents(token);

      setDevices(data);

      if (data.length > 0) {
        setSelectedDeviceId((current) => current ?? data[0].device_id);
      }
    } catch (requestError) {
      setDeviceError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load devices.",
      );
    } finally {
      setDevicesLoading(false);
    }
  };

  const loadDeviceNetwork = async (deviceId: string) => {
    setDeviceLoading(true);
    setDeviceError(null);

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const base = `${API_BASE_URL}/api/v1/security/network/devices/${encodeURIComponent(
        deviceId,
      )}`;

      const [detailsResponse, historyResponse] = await Promise.all([
        fetch(base, { method: "GET", headers }),
        fetch(`${base}/snapshots`, { method: "GET", headers }),
      ]);

      if (!detailsResponse.ok) {
        throw new Error(
          `Failed to load device network data: ${detailsResponse.status}`,
        );
      }

      if (!historyResponse.ok) {
        throw new Error(
          `Failed to load snapshot history: ${historyResponse.status}`,
        );
      }

      setDeviceDetails((await detailsResponse.json()) as NetworkDeviceDetails);
      setSnapshotHistory(
        (await historyResponse.json()) as NetworkSnapshotHistory,
      );
    } catch (requestError) {
      setDeviceDetails(null);
      setSnapshotHistory(null);

      setDeviceError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load device network data.",
      );
    } finally {
      setDeviceLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
    void loadDevices();
  }, [token]);

  useEffect(() => {
    if (!selectedDeviceId) {
      return;
    }

    void loadDeviceNetwork(selectedDeviceId);
  }, [selectedDeviceId, token]);

  const handleRefresh = () => {
    void loadOverview();

    if (selectedDeviceId) {
      void loadDeviceNetwork(selectedDeviceId);
    }
  };

  const snapshot = deviceDetails?.snapshot ?? null;
  const findings = deviceDetails ? deriveFindings(deviceDetails) : [];

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: "interfaces", label: "Interfaces", count: snapshot?.interfaces.length ?? 0 },
    { key: "connections", label: "Connections", count: snapshot?.connections.length ?? 0 },
    { key: "listeners", label: "Listeners", count: snapshot?.listeners.length ?? 0 },
    { key: "history", label: "History", count: snapshotHistory?.snapshots.length ?? 0 },
  ];

  return (
    <div className="tpp">
      {/* ================= TOOLBAR ================= */}

      <div className="tpp-toolbar">
        <p className="tpp-count">
          {overview?.latest_snapshot
            ? `Latest snapshot ${formatTimestamp(overview.latest_snapshot.collected_at)}`
            : "Network telemetry from your enrolled devices"}
        </p>

        <button
          type="button"
          className="tpa-btn tpp-btn-outline"
          onClick={handleRefresh}
          disabled={loading || deviceLoading}
        >
          {loading || deviceLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="tpp-inline-error" role="alert">
          Couldn't load the network overview: {error}
        </p>
      )}

      {/* ================= OVERVIEW STATS ================= */}

      <section className="tpp-stats" aria-label="Network overview">
        <Stat
          label="Reporting devices"
          value={overview ? `${overview.reporting_devices} of ${overview.total_devices}` : "—"}
          note="Devices with a network snapshot"
        />
        <Stat
          label="Interfaces"
          value={overview?.total_interfaces}
          note="Across reporting devices"
        />
        <Stat
          label="Connections"
          value={overview?.total_connections}
          note="Observed in latest snapshots"
        />
        <Stat
          label="Listeners"
          value={overview?.total_listeners}
          note="TCP and UDP listening ports"
        />
        <Stat
          label="Firewall-off reports"
          value={overview?.firewall_disabled_snapshots}
          note="Snapshots with a profile disabled"
          alert={(overview?.firewall_disabled_snapshots ?? 0) > 0}
        />
      </section>

      {/* ================= DEVICES + WORKSPACE ================= */}

      <div className="tpp-split">
        <section className="tpp-card tpp-card-flush tpp-device-list" aria-labelledby="tpp-net-devices">
          <h2 id="tpp-net-devices" className="tpp-list-title">
            Devices <span className="tpp-muted">{devices.length}</span>
          </h2>

          {devicesLoading ? (
            <p className="tpp-state">Loading devices…</p>
          ) : devices.length === 0 ? (
            <p className="tpp-state">No devices are enrolled yet.</p>
          ) : (
            <ul>
              {devices.map((device) => {
                const selected = selectedDeviceId === device.device_id;

                return (
                  <li key={device.device_id}>
                    <button
                      type="button"
                      className={`tpp-list-item ${selected ? "is-selected" : ""}`}
                      onClick={() => setSelectedDeviceId(device.device_id)}
                      aria-current={selected ? "true" : undefined}
                    >
                      <strong>{device.hostname}</strong>
                      <span>{device.device_id}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="tpp-workspace">
          {deviceError && (
            <p className="tpp-inline-error" role="alert">
              Couldn't load this device's network data: {deviceError}
            </p>
          )}

          {deviceLoading && !deviceDetails && (
            <p className="tpp-card tpp-state">Loading network data…</p>
          )}

          {deviceDetails && (
            <>
              {/* Device header */}
              <section className="tpp-card tpp-net-head" aria-busy={deviceLoading}>
                <div>
                  <h2>{deviceDetails.device.hostname}</h2>
                  <p className="tpp-muted tpp-small">
                    {deviceDetails.device.operating_system}{" "}
                    {deviceDetails.device.os_version} · Agent v
                    {deviceDetails.device.agent_version}
                  </p>
                </div>

                <dl className="tpp-net-meta">
                  <div>
                    <dt>Last seen</dt>
                    <dd>{formatTimestamp(deviceDetails.device.last_seen)}</dd>
                  </div>
                  <div>
                    <dt>Latest snapshot</dt>
                    <dd>{snapshot ? formatTimestamp(snapshot.collected_at) : "None yet"}</dd>
                  </div>
                </dl>
              </section>

              {!snapshot ? (
                <section className="tpp-card tpp-state">
                  <strong>No network telemetry yet.</strong>
                  <p>
                    This device is enrolled but hasn't sent a network snapshot.
                    The agent sends one about every minute while it's idle.
                  </p>
                </section>
              ) : (
                <>
                  {/* Findings + firewall */}
                  <div className="tpp-grid">
                    <section className="tpp-card tpp-findings" aria-labelledby="tpp-findings-title">
                      <h2 id="tpp-findings-title" className="tpp-card-title">
                        Findings
                      </h2>

                      {findings.length === 0 ? (
                        <p className="tpp-ok-note">
                          No issues found in the latest snapshot.
                        </p>
                      ) : (
                        <ul className="tpp-finding-list">
                          {findings.map((finding) => (
                            <li
                              key={finding.title}
                              className={`tpp-finding tpp-finding-${finding.severity}`}
                            >
                              <div>
                                <strong>{finding.title}</strong>
                                <p>{finding.detail}</p>
                              </div>
                              <span>{finding.severity === "high" ? "High" : "Medium"}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="tpp-card" aria-labelledby="tpp-fw-title">
                      <h2 id="tpp-fw-title" className="tpp-card-title">
                        Firewall profiles
                      </h2>

                      <ul className="tpp-fw-list">
                        <FirewallProfile label="Domain" enabled={snapshot.firewall_posture?.domain_enabled} />
                        <FirewallProfile label="Private" enabled={snapshot.firewall_posture?.private_enabled} />
                        <FirewallProfile label="Public" enabled={snapshot.firewall_posture?.public_enabled} />
                      </ul>

                      {snapshot.firewall_posture?.error && (
                        <p className="tpp-muted tpp-small tpp-fw-error">
                          {snapshot.firewall_posture.error}
                        </p>
                      )}
                    </section>
                  </div>

                  {/* Tabs */}
                  <section className="tpp-card tpp-card-flush">
                    <div className="tpp-tabs" role="tablist" aria-label="Network data">
                      {tabs.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          role="tab"
                          id={`tpp-tab-${item.key}`}
                          aria-selected={tab === item.key}
                          aria-controls={`tpp-panel-${item.key}`}
                          className={`tpp-tab ${tab === item.key ? "is-active" : ""}`}
                          onClick={() => setTab(item.key)}
                        >
                          {item.label}
                          <span>{item.count}</span>
                        </button>
                      ))}
                    </div>

                    <div
                      role="tabpanel"
                      id={`tpp-panel-${tab}`}
                      aria-labelledby={`tpp-tab-${tab}`}
                      className="tpp-table-wrap tpp-table-tall"
                    >
                      {tab === "interfaces" && (
                        <table className="tpp-table">
                          <thead>
                            <tr>
                              <th scope="col">Interface</th>
                              <th scope="col">Status</th>
                              <th scope="col">MAC</th>
                              <th scope="col">Speed</th>
                              <th scope="col">Addresses</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snapshot.interfaces.map((item) => (
                              <tr key={item.id}>
                                <td><strong>{item.interface_name}</strong></td>
                                <td>
                                  <span className={`tpp-badge tpp-badge-inline ${item.is_up ? "tpp-badge-ok" : "tpp-badge-neutral"}`}>
                                    {item.is_up ? "Up" : "Down"}
                                  </span>
                                </td>
                                <td className="tpp-mono">{item.mac_address || "—"}</td>
                                <td>{item.speed_mbps != null ? `${item.speed_mbps} Mbps` : "—"}</td>
                                <td className="tpp-mono tpp-wrap">{formatAddresses(item.addresses)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {tab === "connections" && (
                        <table className="tpp-table">
                          <thead>
                            <tr>
                              <th scope="col">Protocol</th>
                              <th scope="col">Local</th>
                              <th scope="col">Remote</th>
                              <th scope="col">Status</th>
                              <th scope="col">Process</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snapshot.connections.map((item) => (
                              <tr key={item.id}>
                                <td>{item.protocol}</td>
                                <td className="tpp-mono">{formatEndpoint(item.local_address, item.local_port)}</td>
                                <td className="tpp-mono">{formatEndpoint(item.remote_address, item.remote_port)}</td>
                                <td>{item.status || "—"}</td>
                                <td>{item.process_name || item.pid || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {tab === "listeners" && (
                        <table className="tpp-table">
                          <thead>
                            <tr>
                              <th scope="col">Protocol</th>
                              <th scope="col">Bind address</th>
                              <th scope="col">Port</th>
                              <th scope="col">Process</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snapshot.listeners.map((item) => (
                              <tr key={item.id}>
                                <td>{item.protocol}</td>
                                <td className="tpp-mono">{item.bind_address || "—"}</td>
                                <td>
                                  <strong>{item.port}</strong>
                                  {item.port === RDP_PORT && (
                                    <span className="tpp-badge tpp-badge-warn">RDP</span>
                                  )}
                                </td>
                                <td>{item.process_name || item.pid || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {tab === "history" && (
                        <table className="tpp-table">
                          <thead>
                            <tr>
                              <th scope="col">Collected</th>
                              <th scope="col">Interfaces</th>
                              <th scope="col">Connections</th>
                              <th scope="col">Listeners</th>
                              <th scope="col">Firewall</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snapshotHistory?.snapshots.map((item) => {
                              const firewallHealthy =
                                item.firewall_available &&
                                item.firewall_domain_enabled !== false &&
                                item.firewall_private_enabled !== false &&
                                item.firewall_public_enabled !== false;

                              return (
                                <tr key={item.id}>
                                  <td>{formatTimestamp(item.collected_at)}</td>
                                  <td>{item.interfaces}</td>
                                  <td>{item.connections}</td>
                                  <td>{item.listeners}</td>
                                  <td>
                                    <span className={`tpp-badge tpp-badge-inline ${firewallHealthy ? "tpp-badge-ok" : "tpp-badge-danger"}`}>
                                      {firewallHealthy ? "All on" : "Profile off"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}

                      {tabs.find((item) => item.key === tab)?.count === 0 && (
                        <p className="tpp-state">Nothing reported in this snapshot.</p>
                      )}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= SMALL COMPONENTS ================= */

function Stat({
  label,
  value,
  note,
  alert = false,
}: {
  label: string;
  value: number | string | undefined;
  note: string;
  alert?: boolean;
}) {
  return (
    <div className={`tpp-stat ${alert ? "tpp-stat-alert" : ""}`}>
      <span className="tpp-stat-label">{label}</span>
      <strong>
        {value === undefined
          ? "—"
          : typeof value === "number"
          ? value.toLocaleString()
          : value}
      </strong>
      <span className="tpp-muted tpp-small">{note}</span>
    </div>
  );
}

function FirewallProfile({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean | null | undefined;
}) {
  const state =
    enabled == null ? "Unknown" : enabled ? "Enabled" : "Disabled";

  const tone =
    enabled == null ? "tpp-badge-neutral" : enabled ? "tpp-badge-ok" : "tpp-badge-danger";

  return (
    <li className="tpp-fw-row">
      <span>{label}</span>
      <span className={`tpp-badge tpp-badge-inline ${tone}`}>{state}</span>
    </li>
  );
}

export default NetworkSecurity;
