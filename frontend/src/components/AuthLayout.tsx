import type { ReactNode } from "react";

import "../auth.css";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  onBack?: () => void;
  children: ReactNode;
};

const POINTS = [
  {
    title: "Observe",
    text: "Health and network findings for every enrolled device.",
  },
  {
    title: "Fix",
    text: "Run PowerShell or CMD without taking over the screen.",
  },
  {
    title: "Take over",
    text: "Full remote control when hands on the screen really help.",
  },
];

function AuthLayout({ title, subtitle, onBack, children }: AuthLayoutProps) {
  return (
    <div className="tpu">
      <aside className="tpu-side" aria-hidden="true">
        <div className="tpu-brand">
          <span className="tpu-mark">
            <span />
          </span>
          TechAIPILOT
        </div>

        <div className="tpu-side-copy">
          <p className="tpu-side-title">
            See the problem before you take the screen.
          </p>

          <ul>
            {POINTS.map((point) => (
              <li key={point.title}>
                <strong>{point.title}</strong>
                <span>{point.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="tpu-side-foot">Secure remote support for Windows endpoints</p>
      </aside>

      <main className="tpu-main">
        <div className="tpu-top">
          <div className="tpu-brand tpu-brand-mobile">
            <span className="tpu-mark" aria-hidden="true">
              <span />
            </span>
            TechAIPILOT
          </div>

          {onBack && (
            <button type="button" className="tpu-back" onClick={onBack}>
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 6-6 6 6 6" />
              </svg>
              Back to home
            </button>
          )}
        </div>

        <section className="tpu-card" aria-labelledby="tpu-title">
          <h1 id="tpu-title">{title}</h1>
          <p className="tpu-subtitle">{subtitle}</p>
          {children}
        </section>
      </main>
    </div>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  disabled,
  describedBy,
  visible,
  onToggle,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled: boolean;
  describedBy?: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="tpu-password">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className="tpu-reveal"
        onClick={onToggle}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={disabled}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export default AuthLayout;
