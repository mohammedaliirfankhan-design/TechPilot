import { useState } from "react";
import type { CSSProperties, PointerEvent } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  change: string;
  detail: string;
  icon: string;
  tone: "blue" | "green" | "red" | "purple" | "cyan";
};

function MetricCard({
  label,
  value,
  change,
  detail,
  icon,
  tone,
}: MetricCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [tilt, setTilt] = useState({
    x: 0,
    y: 0,
  });

  const handlePointerMove = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const rect =
      event.currentTarget.getBoundingClientRect();

    const x =
      (event.clientX - rect.left) / rect.width;
    const y =
      (event.clientY - rect.top) / rect.height;

    setTilt({
      x: (0.5 - y) * 7,
      y: (x - 0.5) * 7,
    });
  };

  const handlePointerLeave = () => {
    setIsHovered(false);

    setTilt({
      x: 0,
      y: 0,
    });
  };

  const cardStyle: CSSProperties = {
    transform: isHovered
      ? `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-8px) translateZ(0)`
      : "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0) translateZ(0)",
  };

  return (
    <div
      className={`metric-card glass-card ${tone} ${
        isHovered ? "metric-card-active" : ""
      }`}
      style={cardStyle}
      onPointerEnter={() => setIsHovered(true)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* =====================================================
          3D CARD BACKGROUND
          ===================================================== */}

      <div
        className="metric-card-grid"
        aria-hidden="true"
      />

      <div
        className="metric-card-glow"
        aria-hidden="true"
      />

      <div
        className="metric-card-scan"
        aria-hidden="true"
      />

      {/* =====================================================
          CARD HEADER
          ===================================================== */}

      <div className="metric-top">
        <div className="metric-label-group">
          <span>{label}</span>

          <i
            className="metric-live-dot"
            aria-hidden="true"
          />
        </div>

        <div
          className="metric-icon"
          aria-hidden="true"
        >
          <span>{icon}</span>
        </div>
      </div>

      {/* =====================================================
          VALUE
          ===================================================== */}

      <div className="metric-value-row">
        <strong>{value}</strong>

        <span className="metric-signal">
          <i />
          LIVE
        </span>
      </div>

      {/* =====================================================
          MICRO TELEMETRY
          ===================================================== */}

      <div
        className="metric-sparkline"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      {/* =====================================================
          FOOTER
          ===================================================== */}

      <div className="metric-footer">
        <span className="metric-change">
          {change}
        </span>

        <small>{detail}</small>
      </div>

      {/* =====================================================
          INTERACTION CORNER
          ===================================================== */}

      <div
        className="metric-card-corner"
        aria-hidden="true"
      >
        <span />
        <span />
      </div>
    </div>
  );
}

export default MetricCard;