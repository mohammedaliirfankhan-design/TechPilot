import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import CardHeader from "../components/CardHeader";
import ScrollReveal from "../components/ScrollReveal";
import {
  auditEvents,
  type RiskLevel,
} from "../data/mockData";

type AuditFilter =
  | "All Events"
  | "Security"
  | "Devices"
  | "Automation"
  | "Administration";

const auditFilters: AuditFilter[] = [
  "All Events",
  "Security",
  "Devices",
  "Automation",
  "Administration",
];

function AuditLogs() {
  const [filter, setFilter] =
    useState<AuditFilter>("All Events");

  const [currentPage, setCurrentPage] =
    useState(1);

  const filteredEvents = useMemo(() => {
    if (filter === "All Events") {
      return auditEvents;
    }

    return auditEvents.filter((event) => {
      const text =
        `${event.event} ${event.device} ${event.actor}`.toLowerCase();

      return text.includes(
        filter.toLowerCase().replace(" ", ""),
      );
    });
  }, [filter]);

  return (
    <div className="audit-layout futuristic-audit audit-scroll-experience">
      {/* =====================================================
          AUDIT SCROLL RAIL
          ===================================================== */}

      <div className="audit-scroll-rail" aria-hidden="true">
        <span className="audit-scroll-line" />
        <span className="audit-scroll-dot dot-one" />
        <span className="audit-scroll-dot dot-two" />
        <span className="audit-scroll-dot dot-three" />
        <span className="audit-scroll-dot dot-four" />
        <span className="audit-scroll-dot dot-five" />
      </div>

      {/* =====================================================
          AUDIT COMMAND CENTER
          ===================================================== */}

      <ScrollReveal delay={0}>
        <section className="glass-card audit-command-center audit-3d-panel">
          <div className="audit-command-grid" />

          <div className="audit-command-copy">
            <span className="eyebrow">
              SECURITY TELEMETRY // AUDIT
            </span>

            <h2>
              Every action.
              <span> Traceable.</span>
            </h2>

            <p>
              Security, device,
              administrative and automation
              activity is continuously recorded
              for investigation and operational
              accountability.
            </p>

            <div className="audit-command-tags">
              <span>IMMUTABLE TRACE</span>
              <span>SECURITY READY</span>
              <span>LIVE STREAM</span>
            </div>
          </div>

          <div className="audit-core">
            <div className="audit-core-ring ring-one" />
            <div className="audit-core-ring ring-two" />
            <div className="audit-core-ring ring-three" />

            <div className="audit-core-value">
              <strong>
                {auditEvents.length
                  .toString()
                  .padStart(2, "0")}
              </strong>
              <span>EVENTS</span>
            </div>

            <i className="audit-core-pulse" />
          </div>

          <div className="audit-command-readout">
            <div>
              <span>STREAM</span>
              <strong>LIVE</strong>
            </div>

            <div>
              <span>INTEGRITY</span>
              <strong>100%</strong>
            </div>

            <div>
              <span>ENGINE</span>
              <strong>AUD-01</strong>
            </div>
          </div>

          <div className="audit-command-scan" />
        </section>
      </ScrollReveal>

      {/* =====================================================
          AUDIT OVERVIEW
          ===================================================== */}

      <ScrollReveal delay={60}>
        <section className="audit-summary futuristic-audit-summary audit-3d-section">
          <AuditStat
            label="Events Today"
            value="1,284"
            detail="+8.4% from yesterday"
            tone="blue"
            signal="EVENT VOLUME"
          />

          <AuditStat
            label="Security Events"
            value="47"
            detail="3 require attention"
            tone="red"
            signal="SECURITY"
          />

          <AuditStat
            label="Administrative Actions"
            value="126"
            detail="Last 24 hours"
            tone="purple"
            signal="ADMIN"
          />

          <AuditStat
            label="Failed Actions"
            value="9"
            detail="-12.5% from yesterday"
            tone="yellow"
            signal="FAILURES"
          />
        </section>
      </ScrollReveal>

      {/* =====================================================
          AUDIT TABLE
          ===================================================== */}

      <ScrollReveal delay={120}>
        <section className="glass-card table-card audit-card futuristic-audit-card audit-3d-section">
          <CardHeader
            title="Audit Trail"
            subtitle="Security and administrative activity across TechPilot."
            action="Export"
          />

          <div
            className="audit-stream-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "24px",
              width: "100%",
              margin: "28px 0 18px",
              padding: "0 4px",
            }}
          >
            <div
              className="audit-stream-title"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                minWidth: 0,
              }}
            >
              <i
                aria-hidden="true"
                style={{
                  width: "7px",
                  height: "7px",
                  flex: "0 0 7px",
                  borderRadius: "50%",
                  display: "block",
                }}
              />
              <span
                style={{
                  display: "inline-block",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.08em",
                }}
              >
                AUDIT EVENT STREAM
              </span>
            </div>

            <strong
              className="audit-stream-count"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                flex: "0 0 auto",
                whiteSpace: "nowrap",
                marginLeft: "auto",
              }}
            >
              <span>
                {filteredEvents.length
                  .toString()
                  .padStart(2, "0")}
              </span>
              <span>EVENTS</span>
            </strong>
          </div>

          {/* FILTERS */}

          <div
            className="table-toolbar futuristic-audit-toolbar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "24px",
              width: "100%",
              margin: "0 0 24px",
            }}
          >
            <div
              className="audit-filter-group"
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
                minWidth: 0,
              }}
            >
              {auditFilters.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`filter-chip futuristic-filter-chip ${
                    filter === item
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    setFilter(item);
                    setCurrentPage(1);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    className={`filter-dot ${getFilterClass(
                      item,
                    )}`}
                  />

                  <span>{item}</span>

                  {item ===
                    "All Events" && (
                    <small>
                      {auditEvents.length}
                    </small>
                  )}
                </button>
              ))}
            </div>

            <div
              className="audit-live-indicator"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "9px",
                flex: "0 0 auto",
                whiteSpace: "nowrap",
                marginLeft: "auto",
              }}
            >
              <i />
              <span>RECORDING</span>
            </div>
          </div>

          {/* TABLE */}

          <div
            className="table-wrap futuristic-table-wrap"
            style={{
              width: "100%",
              marginTop: "4px",
            }}
          >
            <table className="futuristic-audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Device</th>
                  <th>Actor</th>
                  <th>Risk</th>
                </tr>
              </thead>

              <tbody>
                {filteredEvents.map(
                  (event, index) => (
                    <tr
                      key={`${event.time}-${event.event}-${event.device}`}
                      className="audit-table-row"
                      style={{
                        "--audit-index":
                          index,
                      } as CSSProperties}
                    >
                      <td>
                        <div className="audit-time-cell">
                          <span className="audit-time-dot" />
                          <span>
                            {event.time}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="audit-event-cell futuristic-audit-event-cell">
                          <div className="audit-event-icon">
                            <span>
                              {getEventIcon(
                                event.event,
                              )}
                            </span>
                            <i />
                          </div>

                          <div>
                            <strong>
                              {event.event}
                            </strong>

                            <span>
                              Security activity
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="audit-device futuristic-audit-device">
                          {event.device}
                        </span>
                      </td>

                      <td>
                        <span className="audit-actor futuristic-audit-actor">
                          {event.actor}
                        </span>
                      </td>

                      <td>
                        <RiskBadge
                          value={
                            event.risk
                          }
                        />
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>

            {filteredEvents.length === 0 && (
              <div className="empty-state futuristic-empty-state">
                <div className="empty-icon">
                  ⌕
                </div>

                <strong>
                  No audit events found
                </strong>

                <span>
                  No events match the
                  selected filter.
                </span>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setFilter(
                      "All Events",
                    )
                  }
                >
                  Reset filter
                </button>
              </div>
            )}
          </div>

          {/* PAGINATION */}

          <div className="audit-footer futuristic-audit-footer">
            <span>
              Showing 1–
              {filteredEvents.length} of
              1,284 events
            </span>

            <div className="pagination futuristic-pagination">
              <button
                type="button"
                className="pagination-button"
                disabled={currentPage === 1}
                onClick={() =>
                  setCurrentPage(
                    (page) =>
                      Math.max(
                        1,
                        page - 1,
                      ),
                  )
                }
              >
                ←
              </button>

              {[1, 2, 3].map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`pagination-button ${
                    currentPage === page
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setCurrentPage(page)
                  }
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                className="pagination-button"
                onClick={() =>
                  setCurrentPage(
                    (page) =>
                      Math.min(
                        3,
                        page + 1,
                      ),
                  )
                }
              >
                →
              </button>
            </div>
          </div>

          <div className="audit-table-scan" />
        </section>
      </ScrollReveal>

      {/* =====================================================
          AUDIT SECURITY NOTICE
          ===================================================== */}

      <ScrollReveal delay={180}>
        <section className="glass-card audit-notice futuristic-audit-notice audit-3d-section">
          <div className="audit-notice-icon">
            <span>✓</span>
            <i />
          </div>

          <div>
            <span className="eyebrow">
              TRACEABILITY ENGINE
            </span>

            <strong>
              Audit logging is active
            </strong>

            <p>
              Administrative, security,
              device, and automation events
              are recorded for traceability
              and investigation.
            </p>
          </div>

          <div className="audit-notice-status">
            <i />
            <span>RECORDING</span>
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          AUDIT PIPELINE
          ===================================================== */}

      <ScrollReveal delay={240}>
        <section className="glass-card audit-pipeline futuristic-audit-pipeline audit-3d-section">
          <CardHeader
            title="Audit Processing"
            subtitle="How operational events move through the traceability engine."
            action=""
          />

          <div className="audit-pipeline-track">
            <AuditPipelineStep
              number="01"
              title="Capture"
              detail="Event received"
              state="complete"
            />

            <AuditConnector />

            <AuditPipelineStep
              number="02"
              title="Normalize"
              detail="Context attached"
              state="complete"
            />

            <AuditConnector />

            <AuditPipelineStep
              number="03"
              title="Classify"
              detail="Risk evaluated"
              state="active"
            />

            <AuditConnector />

            <AuditPipelineStep
              number="04"
              title="Store"
              detail="Trace recorded"
              state="complete"
            />

            <AuditConnector />

            <AuditPipelineStep
              number="05"
              title="Investigate"
              detail="Ready for review"
              state="pending"
            />
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
}

/* =========================================================
   AUDIT STAT
   ========================================================= */

function AuditStat({
  label,
  value,
  detail,
  tone,
  signal,
}: {
  label: string;
  value: string;
  detail: string;
  tone:
    | "blue"
    | "green"
    | "red"
    | "yellow"
    | "purple";
  signal: string;
}) {
  return (
    <div
      className={`glass-card audit-stat futuristic-audit-stat ${tone}`}
    >
      <div className="audit-stat-top">
        <span>{label}</span>
        <i />
      </div>

      <strong>{value}</strong>

      <small>{detail}</small>

      <div className="audit-stat-signal">
        <span>{signal}</span>
        <strong>LIVE</strong>
      </div>

      <div className="audit-stat-grid" />
    </div>
  );
}

/* =========================================================
   EVENT ICON
   ========================================================= */

function getEventIcon(event: string) {
  const normalized =
    event.toLowerCase();

  if (
    normalized.includes(
      "remediation",
    ) ||
    normalized.includes(
      "automation",
    )
  ) {
    return "✦";
  }

  if (
    normalized.includes(
      "diagnostic",
    )
  ) {
    return "⌁";
  }

  if (
    normalized.includes(
      "registered",
    )
  ) {
    return "+";
  }

  if (
    normalized.includes(
      "blocked",
    ) ||
    normalized.includes(
      "failed",
    )
  ) {
    return "!";
  }

  if (
    normalized.includes(
      "session",
    )
  ) {
    return "↔";
  }

  if (
    normalized.includes(
      "security",
    )
  ) {
    return "◈";
  }

  return "•";
}

/* =========================================================
   FILTER CLASS
   ========================================================= */

function getFilterClass(
  filter: AuditFilter,
) {
  switch (filter) {
    case "Security":
      return "security";

    case "Devices":
      return "devices";

    case "Automation":
      return "automation";

    case "Administration":
      return "administration";

    default:
      return "all";
  }
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
   AUDIT PIPELINE
   ========================================================= */

function AuditPipelineStep({
  number,
  title,
  detail,
  state,
}: {
  number: string;
  title: string;
  detail: string;
  state:
    | "complete"
    | "active"
    | "pending";
}) {
  return (
    <div
      className={`audit-pipeline-step ${state}`}
    >
      <div className="audit-pipeline-number">
        {number}
      </div>

      <div className="audit-pipeline-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>

      <i>
        {state === "complete"
          ? "✓"
          : state === "active"
            ? "•"
            : "—"}
      </i>
    </div>
  );
}

function AuditConnector() {
  return (
    <div
      className="audit-pipeline-connector"
      aria-hidden="true"
    >
      <span />
    </div>
  );
}

export default AuditLogs;