import { useEffect, useState } from "react";

import { getAgents, type Agent } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

// The newest agent version available. Devices below this need the new installer.
const LATEST_AGENT_VERSION = "1.2.0";

type Page = "home" | "devices" | "network-security";

type NetworkOverview = {
  total_devices: number;
  reporting_devices: number;
  total_listeners: number;
  firewall_disabled_snapshots: number;
  latest_snapshot: {
    device_id: string;
    collected_at: string;
  } | null;
};

type HomeProps = {
  token: string;
  onNavigate: (page: Page) => void;
  onOpenDevice: (deviceId: string) => void;
};

function isOlderVersion(version: string, latest: string): boolean {
  const a = version.split(".").map((part) => parseInt(part, 10) || 0);
  const b = latest.split(".").map((part) => parseInt(part, 10) || 0);

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;

    if (left !== right) {
      return left < right;
    }
  }

  return false;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Home({ token, onNavigate, onOpenDevice }: HomeProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState(false);

  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [overviewError, setOverviewError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [agentsResult, overviewResult] = await Promise.allSettled([
        getAgents(token),
        fetch(`${API_BASE_URL}/api/v1/security/network/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(String(response.status));
          }
          return (await response.json()) as NetworkOverview;
        }),
      ]);

      if (cancelled) {
        return;
      }

      if (agentsResult.status === "fulfilled") {
        setAgents(agentsResult.value);
      } else {
        setAgentsError(true);
      }

      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value);
      } else {
        setOverviewError(true);
      }

      setAgentsLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const recentAgents = [...agents]
    .sort(
      (a, b) =>
        new Date(b.registered_at).getTime() -
        new Date(a.registered_at).getTime(),
    )
    .slice(0, 6);

  const outdatedCount = agents.filter((agent) =>
    isOlderVersion(agent.agent_version, LATEST_AGENT_VERSION),
  ).length;

  const show = (value: number | undefined) =>
    agentsLoading ? "…" : value === undefined ? "—" : String(value);

  return (
    <div className="tph">
      {/* ================= STATS ================= */}
      <section className="tph-stats" aria-label="Overview">
        <div className="tph-stat">
          <span className="tph-stat-label">Enrolled devices</span>
          <strong>{agentsError ? "—" : show(agents.length)}</strong>
          <span className="tph-stat-note">
            {outdatedCount > 0
              ? `${outdatedCount} on an older agent version`
              : `All on agent ${LATEST_AGENT_VERSION} or newer`}
          </span>
        </div>

        <div className="tph-stat">
          <span className="tph-stat-label">Reporting network data</span>
          <strong>
            {overviewError
              ? "—"
              : agentsLoading
              ? "…"
              : `${overview?.reporting_devices ?? 0} of ${overview?.total_devices ?? 0}`}
          </strong>
          <span className="tph-stat-note">Devices with a network snapshot</span>
        </div>

        <div
          className={`tph-stat ${
            (overview?.firewall_disabled_snapshots ?? 0) > 0 ? "tph-stat-alert" : ""
          }`}
        >
          <span className="tph-stat-label">Firewall-off reports</span>
          <strong>
            {overviewError ? "—" : show(overview?.firewall_disabled_snapshots)}
          </strong>
          <span className="tph-stat-note">Snapshots with a firewall profile disabled</span>
        </div>

        <div className="tph-stat">
          <span className="tph-stat-label">Open listeners</span>
          <strong>{overviewError ? "—" : show(overview?.total_listeners)}</strong>
          <span className="tph-stat-note">Listening ports across reporting devices</span>
        </div>
      </section>

      <div className="tph-grid">
        {/* ================= RECENT DEVICES ================= */}
        <section className="tph-card tph-devices" aria-labelledby="tph-devices-title">
          <div className="tph-card-head">
            <h2 id="tph-devices-title">Recent devices</h2>
            <button
              type="button"
              className="tph-link"
              onClick={() => onNavigate("devices")}
            >
              View all devices
            </button>
          </div>

          {agentsLoading && <p className="tph-empty">Loading devices…</p>}

          {!agentsLoading && agentsError && (
            <p className="tph-empty">
              Couldn't load devices. Check that the API is reachable, then refresh
              the page.
            </p>
          )}

          {!agentsLoading && !agentsError && agents.length === 0 && (
            <div className="tph-empty">
              <p>No devices yet.</p>
              <p>
                Open Devices and choose <strong>Add device</strong> to create an
                enrollment code, then run the installer on the PC.
              </p>
              <button
                type="button"
                className="tpa-btn tpa-btn-primary"
                onClick={() => onNavigate("devices")}
              >
                Add your first device
              </button>
            </div>
          )}

          {!agentsLoading && !agentsError && recentAgents.length > 0 && (
            <div className="tph-table-wrap">
              <table className="tph-table">
                <thead>
                  <tr>
                    <th scope="col">Device</th>
                    <th scope="col">Operating system</th>
                    <th scope="col">Agent</th>
                    <th scope="col">Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAgents.map((agent) => {
                    const outdated = isOlderVersion(
                      agent.agent_version,
                      LATEST_AGENT_VERSION,
                    );

                    return (
                      <tr key={agent.device_id}>
                        <td>
                          <button
                            type="button"
                            className="tph-device"
                            onClick={() => onOpenDevice(agent.device_id)}
                          >
                            <strong>{agent.hostname}</strong>
                            <span>{agent.device_id}</span>
                          </button>
                        </td>
                        <td>
                          {agent.operating_system}{" "}
                          <span className="tph-muted">{agent.os_version}</span>
                        </td>
                        <td>
                          <span className="tph-version">v{agent.agent_version}</span>
                          {outdated && (
                            <span className="tph-badge tph-badge-warn">Update</span>
                          )}
                        </td>
                        <td className="tph-muted">{formatDate(agent.registered_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ================= SIDE COLUMN ================= */}
        <div className="tph-side">
          <section className="tph-card" aria-labelledby="tph-actions-title">
            <h2 id="tph-actions-title">Quick actions</h2>

            <div className="tph-actions">
              <button
                type="button"
                className="tph-action"
                onClick={() => onNavigate("devices")}
              >
                <strong>Add a device</strong>
                <span>Create an enrollment code for a new PC</span>
              </button>

              <button
                type="button"
                className="tph-action"
                onClick={() => onNavigate("network-security")}
              >
                <strong>Review network security</strong>
                <span>Firewall state, listeners and connections</span>
              </button>
            </div>
          </section>

          <section className="tph-card" aria-labelledby="tph-latest-title">
            <h2 id="tph-latest-title">Latest network snapshot</h2>

            {overviewError && (
              <p className="tph-empty">Network data is unavailable right now.</p>
            )}

            {!overviewError && !agentsLoading && !overview?.latest_snapshot && (
              <p className="tph-empty">No snapshots received yet.</p>
            )}

            {!overviewError && overview?.latest_snapshot && (
              <dl className="tph-snapshot">
                <div>
                  <dt>Device</dt>
                  <dd>{overview.latest_snapshot.device_id}</dd>
                </div>
                <div>
                  <dt>Received</dt>
                  <dd>{formatDateTime(overview.latest_snapshot.collected_at)}</dd>
                </div>
              </dl>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default Home;
