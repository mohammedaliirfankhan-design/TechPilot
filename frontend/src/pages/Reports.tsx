import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import CardHeader from "../components/CardHeader";
import ScrollReveal from "../components/ScrollReveal";

type ReportMetric = {
  label: string;
  value: string;
  change: string;
  detail: string;
};

type ReportTone =
  | "blue"
  | "green"
  | "purple"
  | "yellow";

const reportMetrics: ReportMetric[] = [
  {
    label: "Incidents Resolved",
    value: "324",
    change: "+14.2%",
    detail: "vs last month",
  },
  {
    label: "Mean Resolution Time",
    value: "8.4m",
    change: "-21.5%",
    detail: "vs last month",
  },
  {
    label: "Automation Success",
    value: "97.8%",
    change: "+2.4%",
    detail: "vs last month",
  },
  {
    label: "Device Availability",
    value: "98.6%",
    change: "+1.8%",
    detail: "vs last month",
  },
];

const weeklyData = [
  { day: "Mon", value: 68 },
  { day: "Tue", value: 82 },
  { day: "Wed", value: 74 },
  { day: "Thu", value: 91 },
  { day: "Fri", value: 78 },
  { day: "Sat", value: 64 },
  { day: "Sun", value: 72 },
];

function Reports() {
  const [period, setPeriod] =
    useState<"Last 7 days" | "Last 30 days" | "Last 90 days">(
      "Last 30 days",
    );

  const [activeReport, setActiveReport] =
    useState<string | null>(null);

  const [isGenerating, setIsGenerating] =
    useState(false);

  const peakDay = useMemo(
    () =>
      weeklyData.reduce((highest, item) =>
        item.value > highest.value
          ? item
          : highest,
      ),
    [],
  );

  const handleGenerateReport = () => {
    setIsGenerating(true);

    window.setTimeout(() => {
      setIsGenerating(false);
    }, 2200);
  };

  return (
    <div className="reports-layout futuristic-reports reports-scroll-experience">
      {/* =====================================================
          REPORT SCROLL RAIL
          ===================================================== */}

      <div className="reports-scroll-rail" aria-hidden="true">
        <span className="reports-scroll-line" />
        <span className="reports-scroll-dot dot-one" />
        <span className="reports-scroll-dot dot-two" />
        <span className="reports-scroll-dot dot-three" />
        <span className="reports-scroll-dot dot-four" />
        <span className="reports-scroll-dot dot-five" />
      </div>

      {/* =====================================================
          REPORT COMMAND CENTER
          ===================================================== */}

      <ScrollReveal delay={0}>
        <section className="glass-card report-hero futuristic-report-hero reports-3d-panel">
          <div className="report-hero-grid" />

          <div className="report-hero-copy">
            <span className="eyebrow">
              OPERATIONS REPORTING // ANALYTICS
            </span>

            <h2>
              Platform performance
              <span> at a glance.</span>
            </h2>

            <p>
              Track endpoint health, incident
              response, automation outcomes, and
              operational performance from one
              intelligence layer.
            </p>

            <div className="report-actions">
              <button
                type="button"
                className={`neon-button futuristic-neon-button ${
                  isGenerating
                    ? "report-generating"
                    : ""
                }`}
                onClick={handleGenerateReport}
                disabled={isGenerating}
              >
                {isGenerating
                  ? "Generating..."
                  : "Generate Report"}
                <span>→</span>
              </button>

              <button
                type="button"
                className="secondary-button futuristic-secondary-button"
              >
                Export Data
              </button>
            </div>

            <div
              className="report-hero-tags"
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                marginTop: "22px",
                width: "100%",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                LIVE TELEMETRY
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                VERIFIED DATA
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                EXPORT READY
              </span>
            </div>
          </div>

          <div className="report-visual">
            <div className="report-visual-ring ring-one" />
            <div className="report-visual-ring ring-two" />
            <div className="report-visual-ring ring-three" />

            <div className="report-visual-core">
              <strong>98.6</strong>
              <span>HEALTH</span>
            </div>

            <div className="report-visual-scan" />
          </div>

          <div className="report-period futuristic-report-period">
            <span>REPORTING PERIOD</span>

            <strong>{period}</strong>

            <small>
              Updated 5 minutes ago
            </small>

            <div className="report-period-status">
              <i />
              DATA CURRENT
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          KEY METRICS
          ===================================================== */}

      <ScrollReveal delay={60}>
        <section className="report-metrics futuristic-report-metrics reports-3d-section">
          {reportMetrics.map(
            (metric, index) => (
              <ReportMetric
                key={metric.label}
                label={metric.label}
                value={metric.value}
                change={metric.change}
                detail={metric.detail}
                tone={
                  ([
                    "blue",
                    "green",
                    "purple",
                    "yellow",
                  ] as ReportTone[])[
                    index
                  ]
                }
              />
            ),
          )}
        </section>
      </ScrollReveal>

      {/* =====================================================
          PERFORMANCE OVERVIEW
          ===================================================== */}

      <ScrollReveal delay={120}>
        <section className="glass-card report-chart-card futuristic-report-chart-card reports-3d-section">
          <CardHeader
            title="Operational Performance"
            subtitle="Incident and endpoint performance over the last 7 days."
            action={period === "Last 7 days" ? "Last 7 days" : "Change period"}
            onAction={() =>
              setPeriod(
                period === "Last 7 days"
                  ? "Last 30 days"
                  : "Last 7 days",
              )
            }
          />

          <div
            className="report-chart-summary"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "18px",
              width: "100%",
              marginTop: "22px",
              marginBottom: "24px",
            }}
          >
            <div
              className="report-chart-summary-item"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                minWidth: 0,
              }}
            >
              <span>WEEKLY SIGNAL</span>
              <strong>{peakDay.value}%</strong>
              <small>Peak on {peakDay.day}</small>
            </div>

            <div
              className="report-chart-summary-item"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                minWidth: 0,
              }}
            >
              <span>AVERAGE</span>
              <strong>
                {Math.round(
                  weeklyData.reduce(
                    (sum, item) => sum + item.value,
                    0,
                  ) / weeklyData.length,
                )}
                %
              </strong>
              <small>Operational baseline</small>
            </div>

            <div
              className="report-chart-summary-item"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                minWidth: 0,
              }}
            >
              <span>STATUS</span>
              <strong>STABLE</strong>
              <small>No major degradation</small>
            </div>
          </div>

          <div className="report-chart futuristic-report-chart">
            <div className="report-y-axis">
              <span>100</span>
              <span>75</span>
              <span>50</span>
              <span>25</span>
              <span>0</span>
            </div>

            <div className="report-chart-area">
              <div className="report-grid-line" />
              <div className="report-grid-line" />
              <div className="report-grid-line" />
              <div className="report-grid-line" />

              <div className="report-chart-glow" />

              <div className="report-bars">
                {weeklyData.map(
                  (item, index) => (
                    <div
                      className="report-bar-column"
                      key={item.day}
                    >
                      <div
                        className="report-bar-value"
                      >
                        {item.value}
                      </div>

                      <div
                        className="report-bar futuristic-report-bar"
                        style={{
                          height: `${item.value}%`,
                          "--bar-index":
                            index,
                        } as CSSProperties}
                        title={`${item.day}: ${item.value}`}
                      >
                        <span />
                        <i />
                      </div>

                      <span>
                        {item.day}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          BREAKDOWN
          ===================================================== */}

      <ScrollReveal delay={180}>
        <section className="report-breakdown-grid futuristic-report-breakdown-grid reports-3d-section">
          <section className="glass-card futuristic-report-breakdown-card">
            <CardHeader
              title="Incident Resolution"
              subtitle="Current resolution performance."
              action="View incidents"
            />

            <div className="resolution-list">
              <ResolutionRow
                label="Resolved"
                value="324"
                percentage="78%"
                tone="green"
              />

              <ResolutionRow
                label="In Progress"
                value="72"
                percentage="17%"
                tone="blue"
              />

              <ResolutionRow
                label="Escalated"
                value="18"
                percentage="5%"
                tone="red"
              />
            </div>

            <div className="breakdown-footer">
              <span>
                <i />
                RESOLUTION ENGINE
              </span>
              <strong>OPTIMAL</strong>
            </div>
          </section>

          <section className="glass-card futuristic-report-breakdown-card">
            <CardHeader
              title="Device Health"
              subtitle="Endpoint health distribution."
              action="View devices"
            />

            <div className="device-health">
              <HealthDistribution
                label="Healthy"
                value="982"
                percentage="76%"
                tone="green"
              />

              <HealthDistribution
                label="Warning"
                value="238"
                percentage="18%"
                tone="yellow"
              />

              <HealthDistribution
                label="Offline"
                value="74"
                percentage="6%"
                tone="red"
              />
            </div>

            <div className="breakdown-footer">
              <span>
                <i />
                ENDPOINT COVERAGE
              </span>
              <strong>98.6%</strong>
            </div>
          </section>
        </section>
      </ScrollReveal>

      {/* =====================================================
          AVAILABLE REPORTS
          ===================================================== */}

      <ScrollReveal delay={240}>
        <section className="glass-card available-reports futuristic-available-reports reports-3d-section">
          <CardHeader
            title="Available Reports"
            subtitle="Generate operational reports for your workspace."
            action="View archive"
          />

          <div className="report-list futuristic-report-list">
            <ReportItem
              title="Monthly Operations Report"
              description="Endpoint health, incidents, automation, and response performance."
              format="PDF"
              active={
                activeReport ===
                "Monthly Operations Report"
              }
              onGenerate={() =>
                setActiveReport(
                  "Monthly Operations Report",
                )
              }
            />

            <ReportItem
              title="Security Activity Report"
              description="Security events, policy actions, and high-risk endpoint activity."
              format="PDF"
              active={
                activeReport ===
                "Security Activity Report"
              }
              onGenerate={() =>
                setActiveReport(
                  "Security Activity Report",
                )
              }
            />

            <ReportItem
              title="Device Inventory Report"
              description="Complete endpoint inventory and operating system distribution."
              format="CSV"
              active={
                activeReport ===
                "Device Inventory Report"
              }
              onGenerate={() =>
                setActiveReport(
                  "Device Inventory Report",
                )
              }
            />
          </div>

          <div
            className="reports-footer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
              marginTop: "24px",
              paddingTop: "18px",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <i />
              REPORT ENGINE READY
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>LAST SYNC</span>
              <strong>5 MIN AGO</strong>
            </span>
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
}

/* =========================================================
   REPORT METRIC
   ========================================================= */

function ReportMetric({
  label,
  value,
  change,
  detail,
  tone,
}: ReportMetric & {
  tone: ReportTone;
}) {
  return (
    <div
      className={`glass-card report-metric futuristic-report-metric ${tone}`}
    >
      <div
        className="report-metric-top"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        <span>{label}</span>
        <i />
      </div>

      <strong style={{ display: "block", marginBottom: "10px" }}>
        {value}
      </strong>

      <div
        className="report-metric-change"
        style={{
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "7px",
          marginBottom: "16px",
        }}
      >
        <b>{change}</b>
        <small>{detail}</small>
      </div>

      <div className="report-metric-signal">
        <span>LIVE SIGNAL</span>
        <strong>ACTIVE</strong>
      </div>

      <div className="report-metric-grid" />
    </div>
  );
}

/* =========================================================
   RESOLUTION ROW
   ========================================================= */

function ResolutionRow({
  label,
  value,
  percentage,
  tone,
}: {
  label: string;
  value: string;
  percentage: string;
  tone: "green" | "blue" | "red";
}) {
  return (
    <div className="resolution-row futuristic-resolution-row">
      <div
        className="resolution-heading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          marginBottom: "8px",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <i className={`resolution-dot ${tone}`} />
          {label}
        </span>

        <strong>{value}</strong>
      </div>

      <div className="resolution-progress futuristic-resolution-progress">
        <span
          className={tone}
          style={{
            width: percentage,
          }}
        />

        <i
          style={{
            left: percentage,
          }}
        />
      </div>

      <small>{percentage}</small>
    </div>
  );
}

/* =========================================================
   DEVICE HEALTH
   ========================================================= */

function HealthDistribution({
  label,
  value,
  percentage,
  tone,
}: {
  label: string;
  value: string;
  percentage: string;
  tone: "green" | "yellow" | "red";
}) {
  return (
    <div className="health-distribution futuristic-health-distribution">
      <div className="health-distribution-icon">
        <i className={tone} />
      </div>

      <div
        className="health-distribution-info"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          minWidth: 0,
        }}
      >
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      <b style={{ marginLeft: "auto" }}>{percentage}</b>
    </div>
  );
}

/* =========================================================
   REPORT ITEM
   ========================================================= */

function ReportItem({
  title,
  description,
  format,
  active,
  onGenerate,
}: {
  title: string;
  description: string;
  format: "PDF" | "CSV";
  active: boolean;
  onGenerate: () => void;
}) {
  return (
    <div
      className={`report-item futuristic-report-item ${
        active
          ? "report-item-active"
          : ""
      }`}
    >
      <div className="report-file-icon">
        <span>{format}</span>
        <i />
      </div>

      <div
        className="report-item-info"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          minWidth: 0,
        }}
      >
        <strong>{title}</strong>
        <span>{description}</span>
      </div>

      <div className="report-item-meta">
        <span>
          {active
            ? "READY"
            : "AVAILABLE"}
        </span>

        <button
          type="button"
          className="small-action futuristic-small-action"
          onClick={onGenerate}
        >
          {active
            ? "Generated"
            : "Generate"}
          <span>→</span>
        </button>
      </div>
    </div>
  );
}

export default Reports;