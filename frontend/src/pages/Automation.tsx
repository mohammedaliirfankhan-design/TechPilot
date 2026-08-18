import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import CardHeader from "../components/CardHeader";
import ScrollReveal from "../components/ScrollReveal";

type AutomationStatus =
  | "Running"
  | "Awaiting Approval"
  | "Completed";

type AutomationAction = {
  id: string;
  action: string;
  device: string;
  trigger: string;
  status: AutomationStatus;
  time: string;
};

const automationActions: AutomationAction[] = [
  {
    id: "AUTO-1024",
    action: "Restart DNS service",
    device: "FIN-LAP-1042",
    trigger: "DNS resolution failure",
    status: "Awaiting Approval",
    time: "2 min ago",
  },
  {
    id: "AUTO-1023",
    action: "Clear temporary files",
    device: "ENG-LAP-1028",
    trigger: "Disk space threshold",
    status: "Running",
    time: "8 min ago",
  },
  {
    id: "AUTO-1022",
    action: "Restart endpoint service",
    device: "OPS-LAP-1104",
    trigger: "Service unavailable",
    status: "Completed",
    time: "24 min ago",
  },
];

function Automation() {
  const [selectedActionId, setSelectedActionId] =
    useState<string | null>(null);

  const [isSimulationRunning, setIsSimulationRunning] =
    useState(false);

  const statistics = useMemo(() => {
    const awaitingApproval =
      automationActions.filter(
        (item) =>
          item.status ===
          "Awaiting Approval",
      ).length;

    const running =
      automationActions.filter(
        (item) =>
          item.status === "Running",
      ).length;

    const completed =
      automationActions.filter(
        (item) =>
          item.status === "Completed",
      ).length;

    return {
      awaitingApproval,
      running,
      completed,
    };
  }, []);

  const handleRunSimulation = () => {
    setIsSimulationRunning(true);

    window.setTimeout(() => {
      setIsSimulationRunning(false);
    }, 2400);
  };

  return (
    <div className="automation-layout futuristic-automation automation-scroll-experience">
      {/* =====================================================
          AUTOMATION SCROLL RAIL
          ===================================================== */}

      <div className="automation-scroll-rail" aria-hidden="true">
        <span className="automation-scroll-line" />
        <span className="automation-scroll-dot dot-one" />
        <span className="automation-scroll-dot dot-two" />
        <span className="automation-scroll-dot dot-three" />
        <span className="automation-scroll-dot dot-four" />
        <span className="automation-scroll-dot dot-five" />
      </div>

      {/* =====================================================
          AUTOMATION COMMAND CENTER
          ===================================================== */}

      <ScrollReveal delay={0}>
        <section className="glass-card automation-hero futuristic-automation-hero automation-3d-panel">
          <div className="automation-hero-grid" />

          <div className="automation-orb futuristic-automation-orb">
            <div className="automation-orbit orbit-one" />
            <div className="automation-orbit orbit-two" />
            <div className="automation-orbit orbit-three" />

            <div className="automation-orb-core">
              <span>✦</span>
              <small>AUTO</small>
            </div>

            <i className="automation-orb-pulse" />
          </div>

          <div className="automation-hero-copy">
            <span className="eyebrow">
              GOVERNED AUTOMATION // CONTROL
            </span>

            <h2>
              Resolution actions
              <span> under policy control.</span>
            </h2>

            <p>
              TechPilot can recommend and
              execute approved remediation
              while maintaining risk controls,
              auditability, and verification.
            </p>

            <div className="automation-hero-tags">
              <span>
                POLICY ENFORCED
              </span>

              <span>
                VERIFIED
              </span>

              <span>
                AUDIT READY
              </span>
            </div>
          </div>

          <div className="automation-hero-readout">
            <div>
              <span>ENGINE</span>
              <strong>AUTO-01</strong>
            </div>

            <div>
              <span>RUNNING</span>
              <strong>
                {statistics.running
                  .toString()
                  .padStart(2, "0")}
              </strong>
            </div>

            <div>
              <span>QUEUE</span>
              <strong>
                {statistics.awaitingApproval
                  .toString()
                  .padStart(2, "0")}
              </strong>
            </div>
          </div>

          <div className="automation-hero-scan" />
        </section>
      </ScrollReveal>

      {/* =====================================================
          AUTOMATION STATISTICS
          ===================================================== */}

      <ScrollReveal delay={60}>
        <div className="automation-grid futuristic-automation-grid automation-3d-section">
          <AutomationStat
            label="Automated Actions"
            value="148"
            detail="+18% this month"
            tone="blue"
            signal="ACTION VOLUME"
          />

          <AutomationStat
            label="Success Rate"
            value="97.8%"
            detail="+2.4% this month"
            tone="green"
            signal="EXECUTION HEALTH"
          />

          <AutomationStat
            label="Awaiting Approval"
            value="12"
            detail="Across 7 devices"
            tone="yellow"
            signal="GOVERNANCE QUEUE"
          />

          <AutomationStat
            label="Verified Results"
            value="96.2%"
            detail="Post-action validation"
            tone="purple"
            signal="VERIFICATION"
          />
        </div>
      </ScrollReveal>

      {/* =====================================================
          AUTOMATION ACTIONS
          ===================================================== */}

      <ScrollReveal delay={120}>
        <section className="glass-card automation-actions futuristic-automation-actions automation-3d-section">
          <CardHeader
            title="Recent Automation Actions"
            subtitle="Governed remediation activity across endpoints."
            action="View history"
          />

          <div
            className="automation-stream-header"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "24px",
              width: "100%",
              margin: "30px 0 20px",
              padding: "0 4px",
            }}
          >
            <div
              className="automation-stream-title"
              style={{
                display: "inline-flex",
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
                  whiteSpace: "nowrap",
                  letterSpacing: "0.08em",
                }}
              >
                AUTOMATION STREAM
              </span>
            </div>

            <strong
              className="automation-stream-count"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                flex: "0 0 auto",
                marginLeft: "auto",
                whiteSpace: "nowrap",
              }}
            >
              <span>
                {automationActions.length
                  .toString()
                  .padStart(2, "0")}
              </span>
              <span>ACTIONS</span>
            </strong>
          </div>

          <div
            className="automation-table-wrap futuristic-automation-table-wrap"
            style={{
              width: "100%",
              marginTop: "4px",
            }}
          >
            <table className="futuristic-automation-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Device</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>

              <tbody>
                {automationActions.map(
                  (item, index) => (
                    <tr
                      key={item.id}
                      className={
                        selectedActionId ===
                        item.id
                          ? "automation-row-active"
                          : ""
                      }
                      style={{
                        "--automation-index":
                          index,
                        minHeight: "82px",
                      } as CSSProperties}
                    >
                      <td>
                        <div className="automation-action-cell futuristic-automation-action-cell">
                          <div className="automation-action-icon">
                            <span>✦</span>
                            <i />
                          </div>

                          <div>
                            <strong>
                              {item.action}
                            </strong>

                            <span>
                              {item.id}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="automation-device-cell">
                          <strong>
                            {item.device}
                          </strong>

                          <span>
                            ENDPOINT
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="automation-trigger-cell">
                          <span>
                            {item.trigger}
                          </span>

                          <i />
                        </div>
                      </td>

                      <td>
                        <AutomationStatusBadge
                          status={
                            item.status
                          }
                        />
                      </td>

                      <td>
                        <div className="automation-time-cell">
                          <span>
                            {item.time}
                          </span>

                          <button
                            type="button"
                            className="automation-open-button"
                            onClick={() =>
                              setSelectedActionId(
                                item.id,
                              )
                            }
                          >
                            {selectedActionId ===
                            item.id
                              ? "Viewing"
                              : "Inspect"}
                            <span>→</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          <div
            className="automation-table-footer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "24px",
              width: "100%",
              marginTop: "4px",
              padding: "20px 4px 4px",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "9px",
                whiteSpace: "nowrap",
              }}
            >
              <i />
              <span>GOVERNED EXECUTION CHANNEL</span>
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                whiteSpace: "nowrap",
                marginLeft: "auto",
              }}
            >
              <span>POLICY ENGINE</span>
              <strong>ACTIVE</strong>
            </span>
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          GOVERNANCE
          ===================================================== */}

      <ScrollReveal delay={180}>
        <section className="automation-governance futuristic-automation-governance automation-3d-section">
          <GovernanceCard
            icon="✓"
            title="Policy Controlled"
            description="Automation actions are evaluated against configured policies before execution."
            tone="green"
          />

          <GovernanceCard
            icon="⌁"
            title="Verified Results"
            description="Every remediation action is followed by a verification step."
            tone="blue"
          />

          <GovernanceCard
            icon="≡"
            title="Fully Audited"
            description="Automation activity is recorded for operational and security auditing."
            tone="purple"
          />
        </section>
      </ScrollReveal>

      {/* =====================================================
          AUTOMATION PIPELINE
          ===================================================== */}

      <ScrollReveal delay={240}>
        <section className="glass-card automation-pipeline futuristic-automation-pipeline automation-3d-section">
          <CardHeader
            title="Remediation Pipeline"
            subtitle="Governed execution sequence."
            action=""
          />

          <div className="automation-pipeline-track">
            <AutomationPipelineStep
              number="01"
              title="Detect"
              detail="Signal received"
              state="complete"
            />

            <AutomationConnector />

            <AutomationPipelineStep
              number="02"
              title="Evaluate"
              detail="Policy checked"
              state="complete"
            />

            <AutomationConnector />

            <AutomationPipelineStep
              number="03"
              title="Approve"
              detail="Human approval"
              state="active"
            />

            <AutomationConnector />

            <AutomationPipelineStep
              number="04"
              title="Execute"
              detail="Remediation action"
              state="pending"
            />

            <AutomationConnector />

            <AutomationPipelineStep
              number="05"
              title="Verify"
              detail="Outcome confirmed"
              state="pending"
            />
          </div>

          <button
            type="button"
            className={`neon-button automation-simulation-button ${
              isSimulationRunning
                ? "simulation-running"
                : ""
            }`}
            onClick={
              handleRunSimulation
            }
            disabled={
              isSimulationRunning
            }
          >
            {isSimulationRunning
              ? "Simulating..."
              : "Run pipeline simulation"}

            <span>→</span>
          </button>
        </section>
      </ScrollReveal>
    </div>
  );
}

/* =========================================================
   AUTOMATION STAT
   ========================================================= */

function AutomationStat({
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
    | "yellow"
    | "purple";
  signal: string;
}) {
  return (
    <div
      className={`glass-card automation-stat futuristic-automation-stat ${tone}`}
    >
      <div className="automation-stat-top">
        <span>{label}</span>
        <i />
      </div>

      <strong>{value}</strong>

      <small>{detail}</small>

      <div className="automation-stat-signal">
        <span>{signal}</span>
        <strong>LIVE</strong>
      </div>

      <div className="automation-stat-grid" />
    </div>
  );
}

/* =========================================================
   STATUS BADGE
   ========================================================= */

function AutomationStatusBadge({
  status,
}: {
  status: AutomationStatus;
}) {
  const statusClass = status
    .toLowerCase()
    .replaceAll(" ", "-");

  return (
    <span
      className={`badge automation-status futuristic-automation-status ${statusClass}`}
    >
      <i />
      <span>{status}</span>
    </span>
  );
}

/* =========================================================
   GOVERNANCE CARD
   ========================================================= */

function GovernanceCard({
  icon,
  title,
  description,
  tone,
}: {
  icon: string;
  title: string;
  description: string;
  tone: "green" | "blue" | "purple";
}) {
  return (
    <div
      className={`glass-card governance-card futuristic-governance-card ${tone}`}
    >
      <div className="governance-icon">
        {icon}
      </div>

      <div className="governance-copy">
        <div>
          <strong>{title}</strong>
          <span>ENFORCED</span>
        </div>

        <p>{description}</p>
      </div>

      <i className="governance-signal" />
    </div>
  );
}

/* =========================================================
   AUTOMATION PIPELINE
   ========================================================= */

function AutomationPipelineStep({
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
      className={`automation-pipeline-step ${state}`}
    >
      <div className="automation-pipeline-number">
        {number}
      </div>

      <div className="automation-pipeline-copy">
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

function AutomationConnector() {
  return (
    <div
      className="automation-pipeline-connector"
      aria-hidden="true"
    >
      <span />
    </div>
  );
}

export default Automation;