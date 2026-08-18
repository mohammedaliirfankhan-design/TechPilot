import { useEffect, useMemo, useState } from "react";

import CardHeader from "../components/CardHeader";
import ScrollReveal from "../components/ScrollReveal";

type DiagnosticTone =
  | "green"
  | "blue"
  | "yellow"
  | "purple";

type DiagnosticCardProps = {
  title: string;
  value: string;
  detail: string;
  tone: DiagnosticTone;
};

function Diagnostics() {
  const [scanTick, setScanTick] =
    useState(0);

  const [isScanning, setIsScanning] =
    useState(false);

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        setScanTick(
          (value) => value + 1,
        );
      }, 2400);

    return () =>
      window.clearInterval(interval);
  }, []);

  const systemSignal = useMemo(() => {
    const values = [
      94.4,
      94.8,
      95.1,
      94.7,
      95.3,
      94.9,
    ];

    return values[
      scanTick % values.length
    ];
  }, [scanTick]);

  const handleRunDiagnostic = () => {
    setIsScanning(true);

    window.setTimeout(() => {
      setIsScanning(false);
    }, 2200);
  };

  return (
    <div className="diagnostics-layout futuristic-diagnostics diagnostics-scroll-experience">
      {/* =====================================================
          DIAGNOSTIC SCROLL RAIL
          ===================================================== */}

      <div className="diagnostics-scroll-rail" aria-hidden="true">
        <span className="diagnostics-scroll-line" />
        <span className="diagnostics-scroll-dot dot-one" />
        <span className="diagnostics-scroll-dot dot-two" />
        <span className="diagnostics-scroll-dot dot-three" />
        <span className="diagnostics-scroll-dot dot-four" />
      </div>

      {/* =====================================================
          DIAGNOSTIC COMMAND HEADER
          ===================================================== */}

      <ScrollReveal delay={0}>
        <section className="glass-card diagnostics-command-center diagnostics-3d-panel">
          <div className="diagnostics-command-grid" />

          <div className="diagnostics-command-copy">
            <span className="eyebrow">
              DIAGNOSTIC ENGINE // ONLINE
            </span>

            <h2>
              Endpoint intelligence
              <span> synchronized.</span>
            </h2>

            <p>
              Evidence-based endpoint
              investigation across
              operating system, network,
              security and remediation
              signals.
            </p>
          </div>

          <div className="diagnostics-command-orb">
            <div className="diagnostic-orb-ring ring-one" />
            <div className="diagnostic-orb-ring ring-two" />
            <div className="diagnostic-orb-ring ring-three" />

            <div className="diagnostic-command-core">
              <span>AI</span>
              <small>CORE</small>
            </div>

            <div className="diagnostic-orb-pulse" />
          </div>

          <div className="diagnostics-readout">
            <div>
              <span>SIGNAL</span>
              <strong>
                {systemSignal.toFixed(1)}%
              </strong>
            </div>

            <div>
              <span>SCAN</span>
              <strong>
                {isScanning
                  ? "RUNNING"
                  : "READY"}
              </strong>
            </div>

            <div>
              <span>ENGINE</span>
              <strong>AI-01</strong>
            </div>
          </div>

          <div className="diagnostics-scan-line" />
        </section>
      </ScrollReveal>

      {/* =====================================================
          DIAGNOSTIC OVERVIEW
          ===================================================== */}

      <ScrollReveal delay={60}>
        <section className="diagnostic-cards futuristic-diagnostic-cards diagnostics-3d-section">
          <DiagnosticCard
            title="Windows Health"
            value="94.4%"
            detail="234 / 248 passing"
            tone="green"
          />

          <DiagnosticCard
            title="Network Connectivity"
            value="97.2%"
            detail="241 / 248 passing"
            tone="blue"
          />

          <DiagnosticCard
            title="Security Baseline"
            value="91.5%"
            detail="227 / 248 passing"
            tone="yellow"
          />

          <DiagnosticCard
            title="Pending Remediation"
            value="12"
            detail="Actions queued"
            tone="purple"
          />
        </section>
      </ScrollReveal>

      {/* =====================================================
          AI DIAGNOSTIC ANALYSIS
          ===================================================== */}

      <ScrollReveal delay={120}>
        <section className="glass-card diagnostic-analysis futuristic-diagnostic-analysis diagnostics-3d-section">
          <CardHeader
            title="AI Diagnostic Analysis"
            subtitle="Evidence-based endpoint investigation."
            action={
              isScanning
                ? "Scanning..."
                : "Run diagnostic"
            }
            onAction={
              isScanning
                ? undefined
                : handleRunDiagnostic
            }
          />

          <div className="analysis-body">
            {/* ROOT CAUSE */}

            <div
              className="analysis-status futuristic-analysis-status"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "72px minmax(0, 1fr) auto",
                alignItems: "center",
                gap: "24px",
                padding: "28px 30px",
              }}
            >
              <div
                className="analysis-orb futuristic-analysis-orb"
                style={{
                  width: "72px",
                  height: "72px",
                  flex: "0 0 72px",
                }}
              >
                <div className="analysis-orb-ring" />
                <span>AI</span>
              </div>

              <div
                className="analysis-main-copy"
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "9px",
                }}
              >
                <span
                  className="analysis-label"
                  style={{
                    margin: 0,
                    lineHeight: 1.2,
                    letterSpacing: "0.12em",
                  }}
                >
                  LIKELY ROOT CAUSE
                </span>

                <h3
                  style={{
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  DNS resolution failure
                </h3>

                <p
                  style={{
                    margin: 0,
                    maxWidth: "760px",
                    lineHeight: 1.6,
                  }}
                >
                  Endpoint connectivity is available,
                  but approved DNS resolution is failing.
                </p>
              </div>

              <div
                className="confidence futuristic-confidence"
                style={{
                  minWidth: "92px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: "4px",
                  margin: 0,
                }}
              >
                <span>CONFIDENCE</span>
                <strong>94%</strong>
              </div>
            </div>

            {/* EVIDENCE */}

            <div
              className="analysis-subheading"
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "20px",
                margin: "28px 0 16px",
              }}
            >
              <span
                style={{
                  margin: 0,
                  lineHeight: 1.2,
                  letterSpacing: "0.08em",
                }}
              >
                EVIDENCE MATRIX
              </span>

              <small
                style={{
                  margin: 0,
                  whiteSpace: "nowrap",
                  lineHeight: 1.4,
                }}
              >
                {isScanning
                  ? "Collecting signals..."
                  : "4 signals evaluated"}
              </small>
            </div>

            <div
              className="evidence-grid futuristic-evidence-grid"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              <Evidence
                label="Gateway reachable"
                success
              />

              <Evidence
                label="Internet available"
                success
              />

              <Evidence
                label="DNS resolution failed"
              />

              <Evidence
                label="Policy mismatch detected"
              />
            </div>

            {/* SIGNAL VISUALIZATION */}

            <div
              className="diagnostic-signal-panel"
              style={{
                marginTop: "28px",
                padding: "20px 22px",
              }}
            >
              <div
                className="diagnostic-signal-heading"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "20px",
                  marginBottom: "16px",
                }}
              >
                <span style={{ lineHeight: 1.2 }}>
                  SIGNAL TRACE
                </span>

                <strong
                  style={{
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                  }}
                >
                  LIVE
                </strong>
              </div>

              <div className="diagnostic-signal-bars">
                {Array.from({
                  length: 28,
                }).map((_, index) => {
                  const height =
                    25 +
                    ((index * 17 +
                      scanTick * 13) %
                      65);

                  return (
                    <i
                      key={index}
                      style={{
                        height: `${height}%`,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* RECOMMENDATION */}

            <div
              className="recommendation futuristic-recommendation"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "28px",
                marginTop: "28px",
                padding: "22px 24px",
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    lineHeight: 1.2,
                    letterSpacing: "0.1em",
                  }}
                >
                  RECOMMENDED REMEDIATION
                </span>

                <strong
                  style={{
                    lineHeight: 1.4,
                  }}
                >
                  Restore approved DNS configuration
                  and verify resolution.
                </strong>

                <small
                  style={{
                    lineHeight: 1.4,
                  }}
                >
                  Policy-safe action · verification required
                </small>
              </div>

              <button
                type="button"
                className="neon-button futuristic-neon-button"
                style={{
                  flex: "0 0 auto",
                  whiteSpace: "nowrap",
                }}
              >
                Review action
                <span>→</span>
              </button>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          DIAGNOSTIC PIPELINE
          ===================================================== */}

      <ScrollReveal delay={180}>
        <section className="glass-card diagnostic-pipeline futuristic-diagnostic-pipeline diagnostics-3d-section">
          <CardHeader
            title="Diagnostic Pipeline"
            subtitle="Current investigation stages."
            action=""
          />

          <div className="pipeline">
            <PipelineStep
              number="01"
              title="Collect"
              detail="Endpoint telemetry"
              state="complete"
            />

            <PipelineConnector />

            <PipelineStep
              number="02"
              title="Correlate"
              detail="Signal comparison"
              state="complete"
            />

            <PipelineConnector />

            <PipelineStep
              number="03"
              title="Analyze"
              detail="Root cause model"
              state="active"
            />

            <PipelineConnector />

            <PipelineStep
              number="04"
              title="Recommend"
              detail="Governed action"
              state="pending"
            />

            <PipelineConnector />

            <PipelineStep
              number="05"
              title="Verify"
              detail="Post-action check"
              state="pending"
            />
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
}

/* =========================================================
   DIAGNOSTIC CARD
   ========================================================= */

function DiagnosticCard({
  title,
  value,
  detail,
  tone,
}: DiagnosticCardProps) {
  const numericValue =
    Number.parseFloat(value);

  const isPending =
    title === "Pending Remediation";

  const progress =
    isPending
      ? Math.min(
          100,
          numericValue * 5,
        )
      : numericValue;

  return (
    <div
      className={`glass-card diagnostic-card futuristic-diagnostic-card ${tone}`}
    >
      <div className="diagnostic-card-grid" />

      <div className="diagnostic-card-top">
        <div
          className={`diagnostic-dot ${tone}`}
        />

        <span>{title}</span>

        <small>
          {isPending
            ? "QUEUE"
            : "HEALTH"}
        </small>
      </div>

      <strong>{value}</strong>

      <small className="diagnostic-card-detail">
        {detail}
      </small>

      <div className="diagnostic-progress futuristic-diagnostic-progress">
        <span
          style={{
            width: `${progress}%`,
          }}
        />

        <i
          style={{
            left: `${progress}%`,
          }}
        />
      </div>

      <div className="diagnostic-card-footer">
        <span>
          {isPending
            ? "ACTION QUEUE"
            : "SYSTEM SIGNAL"}
        </span>

        <strong>
          {isPending
            ? "12 ACTIVE"
            : "STABLE"}
        </strong>
      </div>
    </div>
  );
}

/* =========================================================
   EVIDENCE
   ========================================================= */

function Evidence({
  label,
  success = false,
}: {
  label: string;
  success?: boolean;
}) {
  return (
    <div
      className={`evidence futuristic-evidence ${
        success
          ? "success"
          : "failed"
      }`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        minHeight: "68px",
        padding: "14px 16px",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          flex: "0 0 30px",
          width: "30px",
          height: "30px",
          display: "grid",
          placeItems: "center",
        }}
      >
        {success ? "✓" : "×"}
      </span>

      <div
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <strong
          style={{
            lineHeight: 1.3,
            whiteSpace: "normal",
          }}
        >
          {label}
        </strong>

        <small
          style={{
            lineHeight: 1.35,
          }}
        >
          {success
            ? "Signal confirmed"
            : "Requires attention"}
        </small>
      </div>

      <i style={{ marginLeft: "auto" }} />
    </div>
  );
}

/* =========================================================
   PIPELINE
   ========================================================= */

function PipelineStep({
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
      className={`pipeline-step futuristic-pipeline-step ${state}`}
    >
      <div className="pipeline-number">
        {number}
      </div>

      <div className="pipeline-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>

      <i className="pipeline-state">
        {state === "complete"
          ? "✓"
          : state === "active"
            ? "•"
            : "—"}
      </i>
    </div>
  );
}

function PipelineConnector() {
  return (
    <div
      className="pipeline-connector futuristic-pipeline-connector"
      aria-hidden="true"
    >
      <span />
    </div>
  );
}

export default Diagnostics;