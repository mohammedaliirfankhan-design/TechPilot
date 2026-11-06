import { useEffect, useState } from "react";

import {
  getAgents,
  type Agent,
} from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/+$/, "");

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
  snapshot: {
    id: number;
    collected_at: string;
    interfaces: NetworkInterface[];
    connections: NetworkConnection[];
    listeners: NetworkListener[];
    firewall_posture: FirewallPosture | null;
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

function NetworkSecurity({
  token,
}: NetworkSecurityProps) {

const loadDevices = async () => {
  setDevicesLoading(true);

  try {
    const data = await getAgents(token);

    setDevices(data);

    if (
      data.length > 0 &&
      !selectedDeviceId
    ) {
      setSelectedDeviceId(data[0].device_id);
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

const loadDeviceNetwork = async (
  deviceId: string,
) => {
  setDeviceLoading(true);
  setDeviceError(null);

  try {
    const [detailsResponse, historyResponse] =
      await Promise.all([
        fetch(
          `${API_BASE_URL}/api/v1/security/network/devices/${encodeURIComponent(
            deviceId,
          )}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
        fetch(
          `${API_BASE_URL}/api/v1/security/network/devices/${encodeURIComponent(
            deviceId,
          )}/snapshots`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
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

    const details =
      (await detailsResponse.json()) as NetworkDeviceDetails;

    const history =
      (await historyResponse.json()) as NetworkSnapshotHistory;

    setDeviceDetails(details);
    setSnapshotHistory(history);
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

const [overview, setOverview] =
  useState<NetworkOverview | null>(null);

const [loading, setLoading] =
  useState(true);

const [error, setError] =
  useState<string | null>(null);

const [devices, setDevices] =
  useState<Agent[]>([]);

const [devicesLoading, setDevicesLoading] =
  useState(true);

const [selectedDeviceId, setSelectedDeviceId] =
  useState<string | null>(null);

const [deviceDetails, setDeviceDetails] =
  useState<NetworkDeviceDetails | null>(null);

const [snapshotHistory, setSnapshotHistory] =
  useState<NetworkSnapshotHistory | null>(null);

const [deviceLoading, setDeviceLoading] =
  useState(false);

const [deviceError, setDeviceError] =
  useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/security/network/overview`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        let message =
          `Failed to load network overview: ${response.status}`;

        try {
          const body = await response.json();

          if (
            body &&
            typeof body.detail === "string"
          ) {
            message = body.detail;
          }
        } catch {
          // Keep default error message.
        }

        throw new Error(message);
      }

      const data =
        (await response.json()) as NetworkOverview;

      setOverview(data);
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

  useEffect(() => {
  void loadOverview();
  void loadDevices();
  }, [token]);

useEffect(() => {
  if (!selectedDeviceId) {
    return;
  }

  void loadDeviceNetwork(
    selectedDeviceId,
  );
  }, [selectedDeviceId, token]);

  const formatTimestamp = (
    value: string | null | undefined,
  ) => {
    if (!value) {
      return "No telemetry yet";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(
      "en-IN",
      {
        dateStyle: "medium",
        timeStyle: "short",
      },
    ).format(date);
  };

  return (
    <section className="network-security-page">
      <div className="network-security-toolbar">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            NETWORK SECURITY
          </span>

          <h2>
            Network visibility
            <span> &amp; posture</span>
          </h2>

          <p>
            Monitor endpoint network telemetry,
            exposure signals, and firewall posture
            across your organization.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            void loadOverview();
          }}
          disabled={loading}
        >
          {loading
            ? "REFRESHING..."
            : "REFRESH TELEMETRY"}
        </button>
      </div>

      {error && (
        <div className="glass-card network-security-error">
          <strong>
            Unable to load network security data
          </strong>

          <span>{error}</span>
        </div>
      )}

      {loading && !overview && (
        <div className="glass-card network-security-loading">
          <div className="empty-icon">
            ◌
          </div>

          <strong>
            Loading network telemetry...
          </strong>

          <p>
            Fetching the latest organization-level
            network security data.
          </p>
        </div>
      )}

      {overview && (
        <>
          <div className="network-security-metrics">
            <NetworkMetric
              label="Total Devices"
              value={overview.total_devices}
              detail={`${overview.reporting_devices} reporting`}
              tone="blue"
            />

            <NetworkMetric
              label="Interfaces"
              value={overview.total_interfaces}
              detail="Across reporting endpoints"
              tone="cyan"
            />

            <NetworkMetric
              label="Connections"
              value={overview.total_connections}
              detail="Observed network connections"
              tone="purple"
            />

            <NetworkMetric
              label="Listeners"
              value={overview.total_listeners}
              detail="TCP / UDP listeners"
              tone="green"
            />

            <NetworkMetric
              label="Firewall Issues"
              value={
                overview.firewall_disabled_snapshots
              }
              detail="Snapshots with disabled profile"
              tone={
                overview.firewall_disabled_snapshots > 0
                  ? "red"
                  : "green"
              }
            />
          </div>

<section className="glass-card network-security-panel network-device-selector">
  <div className="network-security-panel-header">
    <div>
      <span className="eyebrow">
        ENDPOINT NETWORK VISIBILITY
      </span>

      <h3>
        Select an endpoint
      </h3>
    </div>

    <span className="network-roadmap-status">
      {devices.length} DEVICES
    </span>
  </div>

  {devicesLoading ? (
    <div className="network-empty-state">
      Loading endpoints...
    </div>
  ) : devices.length === 0 ? (
    <div className="network-empty-state">
      No endpoints are registered.
    </div>
  ) : (
    <div className="network-device-list">
      {devices.map((device) => (
        <button
          key={device.device_id}
          type="button"
          className={`network-device-item ${
            selectedDeviceId === device.device_id
              ? "selected"
              : ""
          }`}
          onClick={() =>
            setSelectedDeviceId(
              device.device_id,
            )
          }
        >
          <span className="network-device-icon">
            {device.operating_system
              .toLowerCase()
              .includes("windows")
              ? "WIN"
              : "DEV"}
          </span>

          <span className="network-device-copy">
            <strong>
              {device.hostname}
            </strong>

            <small>
              {device.device_id}
            </small>
          </span>

          <span className="network-device-arrow">
            →
          </span>
        </button>
      ))}
    </div>
  )}
</section>

<section className="network-device-workspace">
  {deviceError && (
    <div className="glass-card network-security-error">
      <strong>
        Unable to load endpoint network data
      </strong>

      <span>
        {deviceError}
      </span>
    </div>
  )}

  {deviceLoading ? (
    <div className="glass-card network-security-loading">
      <div className="empty-icon">
        ◌
      </div>

      <strong>
        Loading endpoint network telemetry...
      </strong>

      <p>
        Fetching interfaces, connections,
        listeners, firewall posture, and
        snapshot history.
      </p>
    </div>
  ) : deviceDetails ? (
    <>
      <section className="glass-card network-security-panel network-device-summary">
        <div className="network-security-panel-header">
          <div>
            <span className="eyebrow">
              SELECTED ENDPOINT
            </span>

            <h3>
              {deviceDetails.device.hostname}
            </h3>
          </div>

          <span className="network-roadmap-status">
            {deviceDetails.device.device_id}
          </span>
        </div>

        <div className="network-device-meta">
          <div>
            <span>OPERATING SYSTEM</span>
            <strong>
              {deviceDetails.device.operating_system}
              {" "}
              {deviceDetails.device.os_version}
            </strong>
          </div>

          <div>
            <span>AGENT VERSION</span>
            <strong>
              v{deviceDetails.device.agent_version}
            </strong>
          </div>

          <div>
            <span>LAST SEEN</span>
            <strong>
              {formatTimestamp(
                deviceDetails.device.last_seen,
              )}
            </strong>
          </div>

          <div>
            <span>LATEST SNAPSHOT</span>
            <strong>
              {deviceDetails.snapshot
                ? `#${deviceDetails.snapshot.id}`
                : "No telemetry"}
            </strong>
          </div>
        </div>
      </section>

      {!deviceDetails.snapshot ? (
        <section className="glass-card network-empty-state network-no-telemetry">
          <strong>
            No network telemetry available
          </strong>

          <p>
            This endpoint is registered but has
            not submitted a network security
            snapshot yet.
          </p>
        </section>
      ) : (
        <>
          {/* Network Interfaces */}
          <section className="glass-card network-security-panel">
            <div className="network-security-panel-header">
              <div>
                <span className="eyebrow">
                  NETWORK INTERFACES
                </span>

                <h3>
                  Interfaces
                </h3>
              </div>

              <span className="network-roadmap-status">
                {deviceDetails.snapshot.interfaces.length}
              </span>
            </div>

            <div className="network-table-wrap">
              <table className="network-security-table">
                <thead>
                  <tr>
                    <th>INTERFACE</th>
                    <th>STATUS</th>
                    <th>MAC</th>
                    <th>SPEED</th>
                    <th>ADDRESSES</th>
                  </tr>
                </thead>

                <tbody>
                  {deviceDetails.snapshot.interfaces.map(
                    (networkInterface) => (
                      <tr
                        key={
                          networkInterface.id
                        }
                      >
                        <td>
                          <strong>
                            {
                              networkInterface.interface_name
                            }
                          </strong>
                        </td>

                        <td>
                          <span
                            className={
                              networkInterface.is_up
                                ? "network-state healthy"
                                : "network-state warning"
                            }
                          >
                            {networkInterface.is_up
                              ? "UP"
                              : "DOWN"}
                          </span>
                        </td>

                        <td>
                          {networkInterface.mac_address ||
                            "—"}
                        </td>

                        <td>
                          {networkInterface.speed_mbps !=
                          null
                            ? `${networkInterface.speed_mbps} Mbps`
                            : "—"}
                        </td>

                        <td>
                          {formatAddresses(
                            networkInterface.addresses,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Active Connections */}
          <section className="glass-card network-security-panel">
            <div className="network-security-panel-header">
              <div>
                <span className="eyebrow">
                  ACTIVE CONNECTIONS
                </span>

                <h3>
                  Network connections
                </h3>
              </div>

              <span className="network-roadmap-status">
                {deviceDetails.snapshot.connections.length}
              </span>
            </div>

            <div className="network-table-wrap network-table-tall">
              <table className="network-security-table">
                <thead>
                  <tr>
                    <th>PROTOCOL</th>
                    <th>LOCAL</th>
                    <th>REMOTE</th>
                    <th>STATUS</th>
                    <th>PROCESS</th>
                  </tr>
                </thead>

                <tbody>
                  {deviceDetails.snapshot.connections.map(
                    (connection) => (
                      <tr
                        key={connection.id}
                      >
                        <td>
                          {connection.protocol}
                        </td>

                        <td>
                          {formatEndpoint(
                            connection.local_address,
                            connection.local_port,
                          )}
                        </td>

                        <td>
                          {formatEndpoint(
                            connection.remote_address,
                            connection.remote_port,
                          )}
                        </td>

                        <td>
                          {connection.status || "—"}
                        </td>

                        <td>
                          {connection.process_name ||
                            connection.pid ||
                            "—"}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Listeners + Firewall */}
          <div className="network-security-grid">
            <section className="glass-card network-security-panel">
              <div className="network-security-panel-header">
                <div>
                  <span className="eyebrow">
                    LISTENERS
                  </span>

                  <h3>
                    TCP / UDP listeners
                  </h3>
                </div>

                <span className="network-roadmap-status">
                  {deviceDetails.snapshot.listeners.length}
                </span>
              </div>

              <div className="network-table-wrap network-table-tall">
                <table className="network-security-table">
                  <thead>
                    <tr>
                      <th>PROTOCOL</th>
                      <th>BIND</th>
                      <th>PORT</th>
                      <th>PROCESS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {deviceDetails.snapshot.listeners.map(
                      (listener) => (
                        <tr
                          key={listener.id}
                        >
                          <td>
                            {listener.protocol}
                          </td>

                          <td>
                            {listener.bind_address ||
                              "—"}
                          </td>

                          <td>
                            <strong>
                              {listener.port}
                            </strong>
                          </td>

                          <td>
                            {listener.process_name ||
                              listener.pid ||
                              "—"}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="glass-card network-security-panel">
              <div className="network-security-panel-header">
                <div>
                  <span className="eyebrow">
                    FIREWALL POSTURE
                  </span>

                  <h3>
                    Firewall profiles
                  </h3>
                </div>
              </div>

              <FirewallProfile
                label="DOMAIN"
                enabled={
                  deviceDetails.snapshot
                    .firewall_posture
                    ?.domain_enabled
                }
              />

              <FirewallProfile
                label="PRIVATE"
                enabled={
                  deviceDetails.snapshot
                    .firewall_posture
                    ?.private_enabled
                }
              />

              <FirewallProfile
                label="PUBLIC"
                enabled={
                  deviceDetails.snapshot
                    .firewall_posture
                    ?.public_enabled
                }
              />

              {deviceDetails.snapshot
                .firewall_posture?.error && (
                <div className="network-firewall-error">
                  {
                    deviceDetails.snapshot
                      .firewall_posture.error
                  }
                </div>
              )}
            </section>
          </div>

          {/* Snapshot History */}
          <section className="glass-card network-security-panel">
            <div className="network-security-panel-header">
              <div>
                <span className="eyebrow">
                  TELEMETRY HISTORY
                </span>

                <h3>
                  Snapshot history
                </h3>
              </div>

              <span className="network-roadmap-status">
                {snapshotHistory?.snapshots.length || 0}
              </span>
            </div>

            <div className="network-table-wrap">
              <table className="network-security-table">
                <thead>
                  <tr>
                    <th>SNAPSHOT</th>
                    <th>COLLECTED</th>
                    <th>INTERFACES</th>
                    <th>CONNECTIONS</th>
                    <th>LISTENERS</th>
                    <th>FIREWALL</th>
                  </tr>
                </thead>

                <tbody>
                  {snapshotHistory?.snapshots.map(
                    (snapshot) => {
                      const firewallHealthy =
                        snapshot.firewall_available &&
                        snapshot.firewall_domain_enabled !==
                          false &&
                        snapshot.firewall_private_enabled !==
                          false &&
                        snapshot.firewall_public_enabled !==
                          false;

                      return (
                        <tr
                          key={snapshot.id}
                        >
                          <td>
                            <strong>
                              #{snapshot.id}
                            </strong>
                          </td>

                          <td>
                            {formatTimestamp(
                              snapshot.collected_at,
                            )}
                          </td>

                          <td>
                            {snapshot.interfaces}
                          </td>

                          <td>
                            {snapshot.connections}
                          </td>

                          <td>
                            {snapshot.listeners}
                          </td>

                          <td>
                            <span
                              className={`network-state ${
                                firewallHealthy
                                  ? "healthy"
                                  : "warning"
                              }`}
                            >
                              {firewallHealthy
                                ? "PROTECTED"
                                : "ATTENTION"}
                            </span>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  ) : null}
</section>

          <div className="network-security-grid">
            <section className="glass-card network-security-panel">
              <div className="network-security-panel-header">
                <div>
                  <span className="eyebrow">
                    SECURITY POSTURE
                  </span>

                  <h3>
                    Firewall status
                  </h3>
                </div>

                <span
                  className={`network-status-badge ${
                    overview.firewall_disabled_snapshots > 0
                      ? "warning"
                      : "healthy"
                  }`}
                >
                  <i />

                  {overview.firewall_disabled_snapshots > 0
                    ? "ATTENTION REQUIRED"
                    : "PROTECTED"}
                </span>
              </div>

              <div className="network-firewall-summary">
                <div className="network-firewall-icon">
                  {overview.firewall_disabled_snapshots > 0
                    ? "!"
                    : "✓"}
                </div>

                <div>
                  <strong>
                    {overview.firewall_disabled_snapshots > 0
                      ? "Firewall posture requires review"
                      : "No disabled firewall snapshots detected"}
                  </strong>

                  <span>
                    {overview.firewall_disabled_snapshots > 0
                      ? "One or more telemetry snapshots reported a disabled firewall profile."
                      : "All currently observed firewall profiles are enabled."}
                  </span>
                </div>
              </div>
            </section>

            <section className="glass-card network-security-panel">
              <div className="network-security-panel-header">
                <div>
                  <span className="eyebrow">
                    TELEMETRY
                  </span>

                  <h3>
                    Latest snapshot
                  </h3>
                </div>
              </div>

              {overview.latest_snapshot ? (
                <div className="network-latest-snapshot">
                  <div>
                    <span>DEVICE</span>

                    <strong>
                      {overview.latest_snapshot.device_id}
                    </strong>
                  </div>

                  <div>
                    <span>SNAPSHOT</span>

                    <strong>
                      #{overview.latest_snapshot.id}
                    </strong>
                  </div>

                  <div>
                    <span>COLLECTED</span>

                    <strong>
                      {formatTimestamp(
                        overview.latest_snapshot
                          .collected_at,
                      )}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="network-empty-state">
                  No network telemetry has been
                  received yet.
                </div>
              )}
            </section>
          </div>

          <section className="glass-card network-security-panel network-security-coming-next">
            <div className="network-security-panel-header">
              <div>
                <span className="eyebrow">
                  NETWORK SECURITY ROADMAP
                </span>

                <h3>
                  Visibility foundation is online
                </h3>
              </div>

              <span className="network-roadmap-status">
                N2.2
              </span>
            </div>

            <div className="network-roadmap-grid">
              <RoadmapItem
                title="Endpoint telemetry"
                description="Interfaces, connections, listeners, and firewall posture."
                status="ONLINE"
              />

              <RoadmapItem
                title="Network detections"
                description="Firewall, listener, RDP exposure, scanning, and outbound detections."
                status="NEXT"
              />

              <RoadmapItem
                title="Network assessment"
                description="Authorized discovery and exposure assessment workflows."
                status="PLANNED"
              />
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function formatEndpoint(
  address: string | null,
  port: number | null,
) {
  if (!address && port == null) {
    return "—";
  }

  if (port == null) {
    return address || "—";
  }

  return `${address || "*"}:${port}`;
}

function formatAddresses(
  addresses: unknown,
) {
  if (!addresses) {
    return "—";
  }

  if (Array.isArray(addresses)) {
    return addresses
      .map((address) => {
        if (
          address &&
          typeof address === "object"
        ) {
          const value =
            address as Record<
              string,
              unknown
            >;

          if (
            typeof value.address ===
            "string"
          ) {
            return value.address;
          }
        }

        return String(address);
      })
      .join(", ");
  }

  return String(addresses);
}

function FirewallProfile({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean | null | undefined;
}) {
  const healthy = enabled === true;

  return (
    <div className="network-firewall-profile">
      <div>
        <span>{label}</span>

        <strong>
          {enabled == null
            ? "UNKNOWN"
            : healthy
              ? "ENABLED"
              : "DISABLED"}
        </strong>
      </div>

      <span
        className={`network-state ${
          healthy
            ? "healthy"
            : enabled === false
              ? "warning"
              : ""
        }`}
      >
        {enabled == null
          ? "UNKNOWN"
          : healthy
            ? "OK"
            : "RISK"}
      </span>
    </div>
  );
}

function NetworkMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone:
    | "blue"
    | "cyan"
    | "purple"
    | "green"
    | "red";
}) {
  return (
    <div
      className={`network-security-metric ${tone}`}
    >
      <span>
        {label}
      </span>

      <strong>
        {value.toLocaleString("en-IN")}
      </strong>

      <small>
        {detail}
      </small>
    </div>
  );
}

function RoadmapItem({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div className="network-roadmap-item">
      <div>
        <strong>
          {title}
        </strong>

        <p>
          {description}
        </p>
      </div>

      <span>
        {status}
      </span>
    </div>
  );
}

export default NetworkSecurity;