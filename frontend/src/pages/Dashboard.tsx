import { useEffect, useMemo, useState } from "react";

import MetricCard from "../components/MetricCard";
import CardHeader from "../components/CardHeader";
import { activities } from "../data/mockData";
import ScrollReveal from "../components/ScrollReveal";

type Page =
  | "dashboard"
  | "devices"
  | "diagnostics"
  | "incidents"
  | "automation"
  | "audit"
  | "reports"
  | "settings";

type DashboardProps = {
  onNavigate: (page: Page) => void;
};

type RiskTone = "green" | "yellow" | "red" | "purple";

type AlertLevel = "High" | "Medium";

type LiveMetric = {
  label: string;
  baseValue: number;
  suffix: string;
  change: string;
  detail: string;
  icon: string;
  tone: "blue" | "green" | "red" | "purple" | "cyan";
};

const LIVE_METRICS: LiveMetric[] = [
  {
    label: "Total Devices",
    baseValue: 1294,
    suffix: "",
    change: "+12.5%",
    detail: "vs last 7d",
    icon: "▣",
    tone: "blue",
  },
  {
    label: "Healthy Devices",
    baseValue: 982,
    suffix: "",
    change: "+8.1%",
    detail: "vs last 7d",
    icon: "♥",
    tone: "green",
  },
  {
    label: "Active Alerts",
    baseValue: 24,
    suffix: "",
    change: "-13.5%",
    detail: "vs last 7d",
    icon: "!",
    tone: "red",
  },
  {
    label: "Open Incidents",
    baseValue: 7,
    suffix: "",
    change: "-22.2%",
    detail: "vs last 7d",
    icon: "◈",
    tone: "purple",
  },
  {
    label: "Avg Response Time",
    baseValue: 1.2,
    suffix: "m",
    change: "-18.4%",
    detail: "vs last 7d",
    icon: "◷",
    tone: "cyan",
  },
];

function Dashboard({ onNavigate }: DashboardProps) {
  const [telemetryTick, setTelemetryTick] = useState(0);
  const [liveTime, setLiveTime] = useState("");

  /*
   * Small live telemetry loop.
   *
   * This is intentionally visual/mock telemetry for the frontend.
   * It will later be replaced by the backend monitoring stream.
   */
  useEffect(() => {
    const updateClock = () => {
      setLiveTime(
        new Intl.DateTimeFormat("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }).format(new Date()),
      );
    };

    updateClock();

    const clock = window.setInterval(
      updateClock,
      1000,
    );

    const telemetry = window.setInterval(() => {
      setTelemetryTick((value) => value + 1);
    }, 2200);

    return () => {
      window.clearInterval(clock);
      window.clearInterval(telemetry);
    };
  }, []);

  const liveMetrics = useMemo(() => {
    return LIVE_METRICS.map((metric, index) => {
      const variation =
        index === 0
          ? Math.sin(telemetryTick * 0.55) * 2
          : index === 1
            ? Math.sin(telemetryTick * 0.45 + 1) * 3
            : index === 2
              ? Math.sin(telemetryTick * 0.7 + 2) * 1.5
              : index === 3
                ? Math.sin(telemetryTick * 0.65 + 3) * 0.8
                : Math.sin(telemetryTick * 0.5 + 4) * 0.08;

      const value =
        metric.baseValue + variation;

      return {
        ...metric,
        displayValue:
          metric.suffix === "m"
            ? `${Math.max(0.1, value).toFixed(1)}m`
            : Math.max(0, Math.round(value)).toLocaleString(
                "en-IN",
              ),
      };
    });
  }, [telemetryTick]);

  const healthValue =
    87 + Math.sin(telemetryTick * 0.35) * 0.8;

  const networkPulse =
    1 + Math.sin(telemetryTick * 0.8) * 0.08;

  return (
    <div
      className="rolling-dashboard futuristic-dashboard dashboard-scroll-experience"
      data-telemetry-tick={telemetryTick}
    >
      {/* =====================================================
          SCROLL EXPERIENCE INDICATOR
          ===================================================== */}

      <div className="dashboard-scroll-rail" aria-hidden="true">
        <span className="dashboard-scroll-rail-line" />
        <span className="dashboard-scroll-rail-dot dot-one" />
        <span className="dashboard-scroll-rail-dot dot-two" />
        <span className="dashboard-scroll-rail-dot dot-three" />
        <span className="dashboard-scroll-rail-dot dot-four" />
        <span className="dashboard-scroll-rail-dot dot-five" />
        <span className="dashboard-scroll-rail-dot dot-six" />
      </div>

      {/* =====================================================
          LIVE COMMAND HUD
          ===================================================== */}

      <ScrollReveal
        className="dashboard-section dashboard-command-hud scroll-depth-section"
        delay={0}
      >
        <section className="command-hud glass-card dashboard-3d-panel">
          <div className="command-hud-grid" />

          <div className="command-hud-content">
            <div>
              <span className="eyebrow">
                <span className="eyebrow-dot" />
                LIVE OPERATIONS FEED
              </span>

              <h3>
                Infrastructure telemetry
                <span> synchronized.</span>
              </h3>

              <p>
                Endpoint health, security,
                incidents and remediation
                signals are being monitored
                across the environment.
              </p>
            </div>

            <div className="command-hud-readout">
              <div className="hud-readout-item">
                <span>STREAM</span>
                <strong>LIVE</strong>
              </div>

              <div className="hud-readout-item">
                <span>UPTIME</span>
                <strong>99.98%</strong>
              </div>

              <div className="hud-readout-item">
                <span>SYNC</span>
                <strong>
                  {liveTime || "--:--:--"}
                </strong>
              </div>
            </div>
          </div>

          <div className="hud-scan-line" />
        </section>
      </ScrollReveal>

      {/* =====================================================
          SECTION 01 — LIVE METRICS
          ===================================================== */}

      <ScrollReveal
        className="dashboard-section"
        delay={50}
      >
        <section className="metrics-grid dashboard-metrics-grid futuristic-metrics-grid dashboard-3d-section">
          {liveMetrics.map((metric, index) => (
            <div
              key={metric.label}
              className="dashboard-metric-live"
              style={{
                animationDelay: `${index * 90}ms`,
              }}
            >
              <MetricCard
                label={metric.label}
                value={metric.displayValue}
                change={metric.change}
                detail={metric.detail}
                icon={metric.icon}
                tone={metric.tone}
              />

              <span className="metric-live-indicator">
                LIVE
              </span>
            </div>
          ))}
        </section>
      </ScrollReveal>

      {/* =====================================================
          SECTION 02 — SYSTEM HEALTH + RISK
          ===================================================== */}

      <ScrollReveal
        className="dashboard-section"
        delay={100}
      >
        <section className="dashboard-grid dashboard-health-grid dashboard-3d-section">
          <div className="glass-card health-card dashboard-panel dashboard-health-panel futuristic-panel">
            <CardHeader
              title="System Health"
              subtitle="Endpoint health across your environment."
              action="Last 7 days"
            />

            <div className="chart-summary">
              <div>
                <strong>
                  {healthValue.toFixed(0)}%
                </strong>

                <span>Healthy</span>
              </div>

              <div className="chart-change">
                +4.8% ↗
              </div>
            </div>

            <HealthChart
              telemetryTick={telemetryTick}
            />

            <div className="telemetry-footer">
              <span>
                <i className="telemetry-dot" />
                TELEMETRY STREAM
              </span>

              <strong>
                {telemetryTick % 2 === 0
                  ? "STABLE"
                  : "PROCESSING"}
              </strong>
            </div>
          </div>

          <div className="glass-card risk-card dashboard-panel dashboard-risk-panel futuristic-panel">
            <CardHeader
              title="Risk Distribution"
              subtitle="Current endpoint risk levels."
              action="View details"
              onAction={() =>
                onNavigate("devices")
              }
            />

            <div className="risk-content">
              <div
                className="donut-chart futuristic-donut"
                style={{
                  transform: `scale(${networkPulse})`,
                }}
              >
                <div className="donut-ring-glow" />

                <div className="donut-inner">
                  <strong>1,294</strong>
                  <span>Devices</span>
                </div>
              </div>

              <div className="risk-list">
                <RiskRow
                  label="Low Risk"
                  value="68%"
                  tone="green"
                />

                <RiskRow
                  label="Medium Risk"
                  value="22%"
                  tone="yellow"
                />

                <RiskRow
                  label="High Risk"
                  value="8%"
                  tone="red"
                />

                <RiskRow
                  label="Critical Risk"
                  value="2%"
                  tone="purple"
                />
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          SECTION 03 — ALERTS + ACTIVITY
          ===================================================== */}

      <ScrollReveal
        className="dashboard-section"
        delay={150}
      >
        <section className="dashboard-grid lower-grid dashboard-lower-grid dashboard-3d-section">
          {/* ALERTS */}

          <div className="glass-card futuristic-panel">
            <CardHeader
              title="Top Alerts"
              subtitle="Issues requiring attention."
              action="View all"
              onAction={() =>
                onNavigate("incidents")
              }
            />

            <div className="alert-list">
              <AlertRow
                title="High CPU Usage"
                device="ENG-LAP-1028"
                time="2m ago"
                level="High"
                active={telemetryTick % 3 === 0}
              />

              <AlertRow
                title="Disk Space Low"
                device="OPS-LAP-1104"
                time="10m ago"
                level="Medium"
              />

              <AlertRow
                title="Failed Login Attempts"
                device="WEB-SRV-003"
                time="15m ago"
                level="Medium"
              />

              <AlertRow
                title="Service Down"
                device="CACHE-SRV-01"
                time="30m ago"
                level="High"
              />
            </div>
          </div>

          {/* ACTIVITY */}

          <div className="glass-card futuristic-panel">
            <CardHeader
              title="Recent Activity"
              subtitle="Latest platform events."
              action="View audit"
              onAction={() =>
                onNavigate("audit")
              }
            />

            <div className="activity-list">
              {activities.map((activity) => (
                <ActivityRow
                  key={`${activity.title}-${activity.device}`}
                  title={activity.title}
                  device={activity.device}
                  time={activity.time}
                  type={activity.type}
                />
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          SECTION 04 — INFRASTRUCTURE
          ===================================================== */}

      <ScrollReveal
        className="dashboard-section"
        delay={200}
      >
        <section className="glass-card infrastructure-card dashboard-infrastructure futuristic-panel dashboard-3d-section">
          <CardHeader
            title="Infrastructure Overview"
            subtitle="Connected endpoint distribution."
            action="View devices"
            onAction={() =>
              onNavigate("devices")
            }
          />

          <div className="infrastructure-content">
            <div
              className="network-visual futuristic-network-visual"
              style={{
                "--network-pulse": networkPulse,
              } as React.CSSProperties}
            >
              <div className="network-hologram-grid" />

              <div className="network-orbit orbit-one" />
              <div className="network-orbit orbit-two" />
              <div className="network-orbit orbit-three" />

              <div className="network-scan-ring" />

              <div className="network-core dashboard-network-core futuristic-network-core">
                <span>TP</span>
                <small>CORE</small>
              </div>

              <div className="network-node node-one dashboard-network-node">
                <span>248</span>
                <small>WIN</small>
              </div>

              <div className="network-node node-two dashboard-network-node">
                <span>91</span>
                <small>LIN</small>
              </div>

              <div className="network-node node-three dashboard-network-node">
                <span>37</span>
                <small>MAC</small>
              </div>

              <div className="network-node node-four dashboard-network-node">
                <span>12</span>
                <small>SRV</small>
              </div>

              <div className="network-connection connection-one" />
              <div className="network-connection connection-two" />
              <div className="network-connection connection-three" />
              <div className="network-connection connection-four" />
            </div>

            <div className="infrastructure-stats">
              <InfrastructureStat
                label="Windows"
                value="1,018"
                percentage="78.7%"
              />

              <InfrastructureStat
                label="Linux"
                value="194"
                percentage="15.0%"
              />

              <InfrastructureStat
                label="macOS"
                value="82"
                percentage="6.3%"
              />
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          SECTION 05 — PLATFORM CAPABILITIES
          ===================================================== */}

      <ScrollReveal
        className="dashboard-section"
        delay={250}
      >
        <section className="feature-strip dashboard-feature-strip futuristic-feature-strip dashboard-3d-section">
          <FeatureHighlight
            icon="↯"
            title="Lightweight Agent"
            description="Low-resource endpoint monitoring built for performance."
            tone="blue"
            status="ONLINE"
          />

          <FeatureHighlight
            icon="✦"
            title="Intelligent Diagnostics"
            description="AI-assisted root-cause analysis with evidence."
            tone="purple"
            status="READY"
          />

          <FeatureHighlight
            icon="⌁"
            title="Governed Automation"
            description="Policy-aware remediation with verification."
            tone="green"
            status="ACTIVE"
          />
        </section>
      </ScrollReveal>

      {/* =====================================================
          LIVE FOOTER TELEMETRY
          ===================================================== */}

      <ScrollReveal
        className="dashboard-section dashboard-live-footer scroll-depth-section"
        delay={300}
      >
        <section className="live-telemetry-strip glass-card dashboard-3d-section">
          <div>
            <span className="eyebrow">
              TELEMETRY CHANNEL
            </span>

            <strong>
              TechPilot monitoring fabric
            </strong>
          </div>

          <div className="live-telemetry-values">
            <span>
              <i />
              CPU 42%
            </span>

            <span>
              <i />
              RAM 61%
            </span>

            <span>
              <i />
              NET 99.9%
            </span>

            <span>
              <i />
              AGENTS 1,287/1,294
            </span>
          </div>

          <div className="live-telemetry-time">
            {liveTime || "--:--:--"}
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
}

/* =========================================================
   HEALTH CHART
   ========================================================= */

function HealthChart({
  telemetryTick,
}: {
  telemetryTick: number;
}) {
  const points = useMemo(() => {
    const base = [
      122,
      104,
      112,
      78,
      94,
      55,
      69,
      38,
      63,
      47,
      69,
      45,
      58,
      31,
      46,
      24,
    ];

    return base
      .map((point, index) => {
        const movement =
          Math.sin(
            telemetryTick * 0.45 +
              index * 0.55,
          ) * 4;

        const x = index * 35;

        return `${x},${Math.max(
          16,
          Math.min(132, point + movement),
        )}`;
      })
      .join(" ");
  }, [telemetryTick]);

  return (
    <div className="health-chart">
      <div className="chart-y-axis">
        <span>100%</span>
        <span>75%</span>
        <span>50%</span>
        <span>25%</span>
        <span>0%</span>
      </div>

      <div className="chart-area">
        <div className="chart-grid-line line-one" />
        <div className="chart-grid-line line-two" />
        <div className="chart-grid-line line-three" />
        <div className="chart-grid-line line-four" />

        <svg
          className="health-svg"
          viewBox="0 0 525 150"
          preserveAspectRatio="none"
          aria-label="System health trend"
          role="img"
        >
          <defs>
            <linearGradient
              id="healthFill"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="#3c8dff"
                stopOpacity="0.32"
              />

              <stop
                offset="100%"
                stopColor="#8a35ff"
                stopOpacity="0"
              />
            </linearGradient>

            <linearGradient
              id="healthStroke"
              x1="0"
              x2="1"
            >
              <stop
                offset="0%"
                stopColor="#20d8ff"
              />

              <stop
                offset="100%"
                stopColor="#9a4dff"
              />
            </linearGradient>

            <filter
              id="healthGlow"
              x="-20%"
              y="-50%"
              width="140%"
              height="200%"
            >
              <feGaussianBlur
                stdDeviation="3"
                result="blur"
              />

              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <polyline
            points={`0,150 ${points} 525,150`}
            fill="url(#healthFill)"
            stroke="none"
          />

          <polyline
            points={points}
            fill="none"
            stroke="url(#healthStroke)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#healthGlow)"
          />
        </svg>

        <div className="chart-live-scan" />

        <div className="chart-dates">
          <span>May 21</span>
          <span>May 22</span>
          <span>May 23</span>
          <span>May 24</span>
          <span>May 25</span>
          <span>May 26</span>
          <span>May 27</span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   RISK
   ========================================================= */

function RiskRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: RiskTone;
}) {
  return (
    <div className="risk-row dashboard-risk-row">
      <span className={`risk-dot ${tone}`} />

      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

/* =========================================================
   ALERTS
   ========================================================= */

function AlertRow({
  title,
  device,
  time,
  level,
  active = false,
}: {
  title: string;
  device: string;
  time: string;
  level: AlertLevel;
  active?: boolean;
}) {
  return (
    <div
      className={`alert-row dashboard-alert-row ${
        active ? "alert-live" : ""
      }`}
    >
      <div
        className={`alert-icon ${level.toLowerCase()}`}
      >
        !
      </div>

      <div>
        <strong>{title}</strong>
        <span>{device}</span>
      </div>

      <small>{time}</small>

      <StatusBadge value={level} />
    </div>
  );
}

/* =========================================================
   ACTIVITY
   ========================================================= */

function ActivityRow({
  title,
  device,
  time,
  type,
}: {
  title: string;
  device: string;
  time: string;
  type:
    | "success"
    | "warning"
    | "info"
    | "danger";
}) {
  return (
    <div className="activity-row dashboard-activity-row">
      <div className={`activity-icon ${type}`}>
        {type === "success" && "✓"}
        {type === "warning" && "!"}
        {type === "info" && "i"}
        {type === "danger" && "×"}
      </div>

      <div className="activity-copy">
        <strong>{title}</strong>
        <span>{device}</span>
      </div>

      <time>{time}</time>
    </div>
  );
}

/* =========================================================
   INFRASTRUCTURE
   ========================================================= */

function InfrastructureStat({
  label,
  value,
  percentage,
}: {
  label: string;
  value: string;
  percentage: string;
}) {
  return (
    <div className="infrastructure-stat">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      <small>{percentage}</small>

      <div className="stat-bar">
        <span
          style={{
            width: percentage,
          }}
        />
      </div>
    </div>
  );
}

/* =========================================================
   FEATURE HIGHLIGHTS
   ========================================================= */

function FeatureHighlight({
  icon,
  title,
  description,
  tone,
  status,
}: {
  icon: string;
  title: string;
  description: string;
  tone: "blue" | "purple" | "green";
  status: string;
}) {
  return (
    <div
      className={`feature-highlight ${tone} dashboard-feature-card`}
    >
      <div className="feature-icon">
        {icon}
      </div>

      <div>
        <div className="feature-title-row">
          <strong>{title}</strong>
          <small>{status}</small>
        </div>

        <p>{description}</p>
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
  value: AlertLevel;
}) {
  const className = value.toLowerCase();

  return (
    <span className={`badge ${className}`}>
      <i />
      {value}
    </span>
  );
}

export default Dashboard;