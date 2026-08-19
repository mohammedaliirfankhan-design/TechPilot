import { useEffect, useMemo, useState } from "react";

import CardHeader from "../components/CardHeader";
import ScrollReveal from "../components/ScrollReveal";
import {
  type DeviceStatus,
  type RiskLevel,
} from "../data/mockData";
import {
  getAgents,
  type Agent,
} from "../api";
type DevicesProps = {
  searchQuery?: string;
  onDeviceSelect?: (deviceId: string) => void;
};

type Filter = "All" | DeviceStatus;

function Devices({
  searchQuery = "",
  onDeviceSelect,
}: DevicesProps) {
  const [filter, setFilter] =
    useState<Filter>("All");
    const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      try {
        setLoading(true);
        setError(null);

        const data = await getAgents();

        if (!cancelled) {
          setAgents(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load agents",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAgents();

    return () => {
      cancelled = true;
    };
  }, []);
 const filteredDevices = useMemo(() => {
  const query = searchQuery.trim().toLowerCase();

  if (!query) {
    return agents;
  }

  return agents.filter((agent) => {
    return (
      agent.hostname.toLowerCase().includes(query) ||
      agent.device_id.toLowerCase().includes(query) ||
      agent.operating_system.toLowerCase().includes(query) ||
      agent.os_version.toLowerCase().includes(query)
    );
  });
}, [agents, searchQuery]);

// The current /agents endpoint confirms registration,
// but does not yet expose live health/status.
// For this stage, registered agents are counted as available.
const healthyCount = agents.length;
const warningCount = 0;
const offlineCount = 0;

  return (
    <ScrollReveal
      className="devices-experience devices-scroll-experience devices-scroll-depth"
      delay={0}
    >
      <section className="glass-card table-card futuristic-devices-card devices-3d-panel">
        {/* ===================================================
            DEVICE SCROLL RAIL
            =================================================== */}

        <div className="devices-scroll-rail" aria-hidden="true">
          <span className="devices-scroll-line" />
          <span className="devices-scroll-dot dot-one" />
          <span className="devices-scroll-dot dot-two" />
          <span className="devices-scroll-dot dot-three" />
          <span className="devices-scroll-dot dot-four" />
        </div>

        {/* ===================================================
            DEVICE COMMAND HEADER
            =================================================== */}

        <CardHeader
  title="Managed Devices"
  subtitle={`${agents.length} registered endpoint${
    agents.length === 1 ? "" : "s"
  }`}
  action="+ Add device"
/>

          <div className="devices-command-status">
            <span className="devices-command-live">
              <i />
              LIVE INVENTORY
            </span>

            <span className="devices-command-time">
              STREAM ACTIVE
            </span>
          </div>


        {/* ===================================================
            DEVICE SUMMARY
            =================================================== */}

        <div
          className="device-summary-grid devices-3d-section"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "16px",
            margin: "24px 0 22px",
            alignItems: "stretch",
          }}
        >
          <DeviceSummary
  label="TOTAL"
  value={agents.length}
  tone="blue"
/>

          <DeviceSummary
            label="HEALTHY"
            value={healthyCount}
            tone="green"
          />

          <DeviceSummary
            label="WARNING"
            value={warningCount}
            tone="yellow"
          />

          <DeviceSummary
            label="OFFLINE"
            value={offlineCount}
            tone="red"
          />
        </div>

{/* ===================================================
    REAL TECHPILOT AGENTS
    =================================================== */}

<div
  className="devices-3d-section"
  style={{
    marginBottom: "24px",
    padding: "20px",
    borderRadius: "14px",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    background: "rgba(15, 23, 42, 0.35)",
  }}
>
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px",
    }}
  >
    <div>
      <strong
        style={{
          display: "block",
          fontSize: "14px",
          letterSpacing: "0.08em",
        }}
      >
        CONNECTED TECHPILOT AGENTS
      </strong>

      <span
        style={{
          display: "block",
          marginTop: "5px",
          fontSize: "12px",
          opacity: 0.6,
        }}
      >
        Live inventory received from the TechPilot API
      </span>
    </div>

    <span
      style={{
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "0.08em",
      }}
    >
      {loading
        ? "SYNCING..."
        : error
          ? "API ERROR"
          : `${agents.length} AGENTS`}
    </span>
  </div>

  {error && (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "10px",
        background: "rgba(239, 68, 68, 0.08)",
        color: "#fca5a5",
        fontSize: "13px",
      }}
    >
      {error}
    </div>
  )}

  {!loading && !error && agents.length === 0 && (
    <div
      style={{
        padding: "20px 0",
        opacity: 0.6,
        fontSize: "13px",
      }}
    >
      No TechPilot agents are currently registered.
    </div>
  )}

  {!loading &&
    !error &&
    filteredDevices.map((agent) => (
  <div
    key={agent.id}
    onClick={() => onDeviceSelect?.(agent.device_id)}
    role="button"
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        onDeviceSelect?.(agent.device_id);
      }
    }}
      >
        <div>
          <strong
            style={{
              display: "block",
              fontSize: "14px",
            }}
          >
            {agent.hostname}
          </strong>

          <span
            style={{
              display: "block",
              marginTop: "4px",
              fontSize: "11px",
              opacity: 0.55,
              fontFamily: "monospace",
            }}
          >
            {agent.device_id}
          </span>
        </div>

        <div>
          <span
            style={{
              display: "block",
              fontSize: "11px",
              opacity: 0.55,
              letterSpacing: "0.06em",
            }}
          >
            OPERATING SYSTEM
          </span>

          <strong
            style={{
              display: "block",
              marginTop: "4px",
              fontSize: "13px",
            }}
          >
            {agent.operating_system}
          </strong>

          <span
            style={{
              display: "block",
              marginTop: "2px",
              fontSize: "11px",
              opacity: 0.6,
            }}
          >
            {agent.os_version}
          </span>
        </div>

        <div>
          <span
            style={{
              display: "block",
              fontSize: "11px",
              opacity: 0.55,
              letterSpacing: "0.06em",
            }}
          >
            AGENT VERSION
          </span>

          <strong
            style={{
              display: "block",
              marginTop: "4px",
              fontSize: "13px",
            }}
          >
            v{agent.agent_version}
          </strong>
        </div>

        <div>
          <span
            style={{
              display: "block",
              fontSize: "11px",
              opacity: 0.55,
              letterSpacing: "0.06em",
            }}
          >
            REGISTERED
          </span>

          <span
            style={{
              display: "block",
              marginTop: "4px",
              fontSize: "11px",
              opacity: 0.75,
            }}
          >
            {new Date(
              agent.registered_at,
            ).toLocaleString()}
          </span>
        </div>
      </div>
    ))}
</div>
        

{/* ===================================================
    TABLE FOOTER
=================================================== */}

        <div
          className="devices-table-footer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "48px",
            marginTop: "22px",
            padding: "20px 24px 24px",
            minHeight: "72px",
            borderTop: "1px solid rgba(148, 163, 184, 0.10)",
            boxSizing: "border-box",
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              margin: 0,
              whiteSpace: "nowrap",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              lineHeight: 1.4,
            }}
          >
            <i
              style={{
                width: "7px",
                height: "7px",
                flex: "0 0 7px",
                borderRadius: "50%",
                display: "inline-block",
              }}
            />
            ENDPOINT TELEMETRY SYNCHRONIZED
          </span>

          <span
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: "5px",
              margin: 0,
              whiteSpace: "nowrap",
              fontSize: "13px",
              fontWeight: 500,
              lineHeight: 1.5,
            }}
          >
            Showing
            <strong>
              {filteredDevices.length}
            </strong>
            of
            <strong>
              {agents.length}
            </strong>
            endpoints
          </span>
        </div>
      </section>
    </ScrollReveal>
  );
}

/* =========================================================
   DEVICE SUMMARY
   ========================================================= */

function DeviceSummary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "yellow" | "red";
}) {
  return (
    <div
      className={`device-summary-card ${tone}`}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: "8px",
        minHeight: "92px",
        padding: "18px 20px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <span
        style={{
          display: "block",
          margin: 0,
          fontSize: "11px",
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: "0.10em",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: "block",
          margin: 0,
          fontSize: "28px",
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        {value
          .toString()
          .padStart(2, "0")}
      </strong>

      <i />
    </div>
  );
}

/* =========================================================
   TELEMETRY CELL
   ========================================================= */

function TelemetryCell({
  value,
  label,
  detail,
  subdetail,
  percentage,
  tone,
}: {
  value: string;
  label: string;
  detail: string;
  subdetail: string;
  percentage: number;
  tone: "normal" | "warning" | "critical";
}) {
  return (
    <div
      className={`telemetry-cell futuristic-telemetry-cell ${tone}`}
    >
      <div className="telemetry-heading">
        <strong>{value}</strong>

        <span>{label}</span>
      </div>

      <span className="telemetry-detail">
        {detail}
      </span>

      <small>{subdetail}</small>

      <div className="telemetry-bar futuristic-telemetry-bar">
        <span
          style={{
            width: `${percentage}%`,
          }}
        />

        <i
          style={{
            left: `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
}

/* =========================================================
   STATUS BADGE
   ========================================================= */

function StatusBadge({
  value,
}: {
  value: DeviceStatus;
}) {
  return (
    <span
      className={`badge futuristic-status-badge ${value.toLowerCase()}`}
    >
      <i />

      <span>{value}</span>
    </span>
  );
}

/* =========================================================
   RISK BADGE
   ========================================================= */

function RiskBadge({
  value,
}: {
  value: RiskLevel;
}) {
  return (
    <span
      className={`badge futuristic-risk-badge ${value.toLowerCase()}`}
    >
      <i />

      <span>{value}</span>
    </span>
  );
}

/* =========================================================
   TELEMETRY TONE
   ========================================================= */

function getTelemetryTone(
  value: number,
): "normal" | "warning" | "critical" {
  if (value >= 90) {
    return "critical";
  }

  if (value >= 75) {
    return "warning";
  }

  return "normal";
}

export default Devices;