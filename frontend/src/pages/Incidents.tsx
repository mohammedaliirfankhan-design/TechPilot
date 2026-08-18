import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import CardHeader from "../components/CardHeader";
import ScrollReveal from "../components/ScrollReveal";
import {
  incidents,
  type RiskLevel,
} from "../data/mockData";

type IncidentTone =
  | "critical"
  | "high"
  | "medium"
  | "low";

function Incidents() {
  const [activeIncidentId, setActiveIncidentId] =
    useState<string | null>(null);

  const summary = useMemo(() => {
    return {
      critical: incidents.filter(
        (incident) =>
          incident.risk === "Critical",
      ).length,
      high: incidents.filter(
        (incident) =>
          incident.risk === "High",
      ).length,
      medium: incidents.filter(
        (incident) =>
          incident.risk === "Medium",
      ).length,
      low: incidents.filter(
        (incident) =>
          incident.risk === "Low",
      ).length,
    };
  }, []);

  const totalActive = incidents.length;

  return (
    <div className="incident-layout futuristic-incidents incidents-scroll-experience">
      {/* =====================================================
          INCIDENT SCROLL RAIL
          ===================================================== */}

      <div className="incidents-scroll-rail" aria-hidden="true">
        <span className="incidents-scroll-line" />
        <span className="incidents-scroll-dot dot-one" />
        <span className="incidents-scroll-dot dot-two" />
        <span className="incidents-scroll-dot dot-three" />
        <span className="incidents-scroll-dot dot-four" />
      </div>

      {/* =====================================================
          INCIDENT COMMAND HEADER
          ===================================================== */}

      <ScrollReveal delay={0}>
        <section className="glass-card incidents-command-center incidents-3d-panel">
          <div className="incidents-command-grid" />

          <div className="incidents-command-copy">
            <span className="eyebrow">
              INCIDENT RESPONSE // LIVE
            </span>

            <h2>
              Operational threats
              <span> under observation.</span>
            </h2>

            <p>
              Monitor active incidents,
              prioritize risk, and move from
              detection to resolution with a
              governed response workflow.
            </p>
          </div>

          <div className="incident-command-core">
            <div className="incident-core-ring ring-one" />
            <div className="incident-core-ring ring-two" />
            <div className="incident-core-ring ring-three" />

            <div className="incident-core-value">
              <strong>
                {totalActive
                  .toString()
                  .padStart(2, "0")}
              </strong>

              <span>ACTIVE</span>
            </div>

            <div className="incident-core-pulse" />
          </div>

          <div className="incidents-command-readout">
            <div>
              <span>CRITICAL</span>
              <strong>
                {summary.critical
                  .toString()
                  .padStart(2, "0")}
              </strong>
            </div>

            <div>
              <span>HIGH</span>
              <strong>
                {summary.high
                  .toString()
                  .padStart(2, "0")}
              </strong>
            </div>

            <div>
              <span>MEDIUM</span>
              <strong>
                {summary.medium
                  .toString()
                  .padStart(2, "0")}
              </strong>
            </div>
          </div>

          <div className="incidents-command-scan" />
        </section>
      </ScrollReveal>

      {/* =====================================================
          INCIDENT SUMMARY
          ===================================================== */}

      <ScrollReveal delay={60}>
        <section className="incident-summary futuristic-incident-summary incidents-3d-section">
          <SummaryCard
            label="Critical"
            value={String(summary.critical)}
            tone="critical"
          />

          <SummaryCard
            label="High"
            value={String(summary.high)}
            tone="high"
          />

          <SummaryCard
            label="Medium"
            value={String(summary.medium)}
            tone="medium"
          />

          <SummaryCard
            label="Low"
            value={String(summary.low)}
            tone="low"
          />
        </section>
      </ScrollReveal>

      {/* =====================================================
          ACTIVE INCIDENTS
          ===================================================== */}

      <ScrollReveal delay={120}>
        <section className="glass-card incident-card futuristic-incident-card incidents-3d-section">
          <CardHeader
            title="Active Incidents"
            subtitle="Current incidents requiring resolution."
            action="Create incident"
          />

          <div className="incident-stream-header">
            <span>
              <i />
              LIVE INCIDENT STREAM
            </span>

            <strong>
              {totalActive} OPEN
            </strong>
          </div>

          <div className="incident-list futuristic-incident-list">
            {incidents.map(
              (incident, index) => (
                <IncidentRow
                  key={incident.id}
                  id={incident.id}
                  title={incident.title}
                  device={incident.device}
                  risk={incident.risk}
                  status={incident.status}
                  index={index}
                  active={
                    activeIncidentId ===
                    incident.id
                  }
                  onOpen={() =>
                    setActiveIncidentId(
                      incident.id,
                    )
                  }
                />
              ),
            )}
          </div>

          {incidents.length === 0 && (
            <div className="empty-state futuristic-empty-state">
              <div className="empty-icon">
                ✓
              </div>

              <strong>
                No active incidents
              </strong>

              <span>
                Your environment currently
                has no unresolved incidents.
              </span>
            </div>
          )}

          <div className="incident-stream-footer">
            <span>
              <i />
              INCIDENT TELEMETRY SYNCHRONIZED
            </span>

            <span>
              RESPONSE ENGINE{" "}
              <strong>READY</strong>
            </span>
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          RESPONSE WORKFLOW
          ===================================================== */}

      <ScrollReveal delay={180}>
        <section className="glass-card incident-workflow futuristic-incident-workflow incidents-3d-section">
          <CardHeader
            title="Response Workflow"
            subtitle="Governed incident resolution path."
            action=""
          />

          <div className="incident-workflow-track">
            <WorkflowStep
              number="01"
              title="Detect"
              detail="Signal received"
              state="complete"
            />

            <WorkflowConnector />

            <WorkflowStep
              number="02"
              title="Triage"
              detail="Risk evaluated"
              state="complete"
            />

            <WorkflowConnector />

            <WorkflowStep
              number="03"
              title="Investigate"
              detail="Evidence collected"
              state="active"
            />

            <WorkflowConnector />

            <WorkflowStep
              number="04"
              title="Remediate"
              detail="Action approved"
              state="pending"
            />

            <WorkflowConnector />

            <WorkflowStep
              number="05"
              title="Verify"
              detail="Resolution confirmed"
              state="pending"
            />
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
}

/* =========================================================
   INCIDENT ROW
   ========================================================= */

function IncidentRow({
  id,
  title,
  device,
  risk,
  status,
  index,
  active,
  onOpen,
}: {
  id: string;
  title: string;
  device: string;
  risk: RiskLevel;
  status: string;
  index: number;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className={`incident-row futuristic-incident-row ${
        active
          ? "incident-row-active"
          : ""
      }`}
      style={{
        "--incident-index": index,
        display: "grid",
        gridTemplateColumns:
          "120px 150px minmax(260px, 1fr) 120px 150px 170px",
        alignItems: "center",
        columnGap: "28px",
        minHeight: "130px",
        padding: "24px 70px",
        position: "relative",
        boxSizing: "border-box",
      } as CSSProperties}
    >
      <div className="incident-row-scan" />

      <div
        className="incident-id"
        style={{
          gridColumn: "2",
          gridRow: "1",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: "7px",
          minWidth: 0,
          margin: 0,
        }}
      >
        <span
          style={{
            display: "block",
            lineHeight: 1,
            margin: 0,
          }}
        >
          INCIDENT
        </span>
        <strong
          style={{
            display: "block",
            lineHeight: 1.2,
            margin: 0,
            whiteSpace: "nowrap",
          }}
        >
          {id}
        </strong>
      </div>

      <div
        className="incident-info"
        style={{
          gridColumn: "3",
          gridRow: "1",
          minWidth: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        <strong
          style={{
            display: "block",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.25,
          }}
        >
          {title}
        </strong>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
          }}
        >
          <i />
          {device}
        </span>
      </div>

      <div
        style={{
          gridColumn: "4",
          gridRow: "1",
          justifySelf: "start",
          display: "flex",
          alignItems: "center",
          margin: 0,
        }}
      >
        <RiskBadge value={risk} />
      </div>

      <span
        className="incident-status"
        style={{
          gridColumn: "5",
          gridRow: "1",
          justifySelf: "start",
          margin: 0,
          whiteSpace: "nowrap",
        }}
      >
        {status}
      </span>

      <button
        type="button"
        className="small-action futuristic-small-action"
        onClick={onOpen}
        aria-expanded={active}
        style={{
          gridColumn: "1",
          gridRow: "1",
          justifySelf: "start",
          alignSelf: "center",
          margin: 0,
          whiteSpace: "nowrap",
        }}
      >
        {active ? "Viewing" : "Open"}
        <span>→</span>
      </button>

      <div
        className="incident-row-signal"
        style={{
          gridColumn: "6",
          gridRow: "1",
          justifySelf: "end",
          margin: 0,
        }}
      >
        <i />
        <i />
        <i />
      </div>
    </div>
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
   SUMMARY CARD
   ========================================================= */

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: IncidentTone;
}) {
  return (
    <div
      className={`glass-card incident-summary-card futuristic-incident-summary-card ${tone}`}
    >
      <div className="incident-summary-top">
        <span>{label}</span>

        <i />
      </div>

      <strong>{value}</strong>

      <small>
        Active incidents
      </small>

      <div className="incident-summary-grid" />
    </div>
  );
}

/* =========================================================
   WORKFLOW
   ========================================================= */

function WorkflowStep({
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
      className={`incident-workflow-step ${state}`}
    >
      <div className="workflow-number">
        {number}
      </div>

      <div className="workflow-copy">
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

function WorkflowConnector() {
  return (
    <div
      className="incident-workflow-connector"
      aria-hidden="true"
    >
      <span />
    </div>
  );
}

export default Incidents;