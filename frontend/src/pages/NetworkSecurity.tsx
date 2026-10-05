import { useEffect, useState } from "react";

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

type NetworkSecurityProps = {
  token: string;
};

function NetworkSecurity({
  token,
}: NetworkSecurityProps) {
  const [overview, setOverview] =
    useState<NetworkOverview | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
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
  }, [token]);

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