import Logo from "../components/Logo";
import "../tokens.css";
import "./landing.css";

type LandingProps = {
  onGetStarted: () => void;
  onLogin: () => void;
};

const CAPABILITIES = [
  {
    title: "Observe",
    text:
      "CPU, memory and disk telemetry from every enrolled device, plus firewall state, RDP exposure, unexpected listeners and suspicious outbound connections.",
    icon: (
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    ),
  },
  {
    title: "Fix",
    text:
      "Run authorised PowerShell or CMD commands on the endpoint while the employee keeps working. Output comes straight back to your browser.",
    icon: (
      <>
        <path d="M4 17l6-5-6-5" />
        <path d="M12 19h8" />
      </>
    ),
  },
  {
    title: "Take over",
    text:
      "Full remote screen with mouse, keyboard and scroll. The stream adapts to the network, so a slow link lowers the frame rate instead of adding delay.",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
        <path d="M12 16v4" />
      </>
    ),
  },
];

const STEPS = [
  {
    title: "Enroll with a code",
    text: "Create a one-time code in the console. The installer ties the device to your organisation.",
  },
  {
    title: "Read the signal",
    text: "Health and security findings show up on the device page before anyone calls you.",
  },
  {
    title: "Fix from the shell",
    text: "Most fixes are a command away. No screen takeover, no interrupted meeting.",
  },
  {
    title: "Take over if needed",
    text: "Open a live session for the cases that really need hands on the screen.",
  },
];

const TRUST = [
  {
    title: "Organisation-scoped enrollment",
    text: "Devices join only through one-time codes issued from your console.",
  },
  {
    title: "Credentials per device",
    text: "Each agent gets its own token. Revoking one device leaves the rest untouched.",
  },
  {
    title: "Sessions end cleanly",
    text: "Ending a session from the console stops the stream and releases control on the endpoint.",
  },
  {
    title: "Read-only security checks",
    text: "Firewall and network checks observe and report. They never change settings on their own.",
  },
];

const STACK = [
  { label: "Endpoint", value: "Windows agent" },
  { label: "Console", value: "Any modern browser" },
  { label: "API", value: "FastAPI service" },
  { label: "Data", value: "PostgreSQL" },
];


function Landing({ onGetStarted, onLogin }: LandingProps) {
  return (
    <div className="tpl">
      <a className="tpl-skip" href="#tpl-main">
        Skip to content
      </a>

      {/* ================= NAV ================= */}
      <header className="tpl-header">
        <div className="tpl-container tpl-nav">
          <a className="tpl-brand" href="#top" aria-label="TechAIPILOT home">
            <Logo size={30} />
            <span className="tpl-brand-name">TechAIPILOT</span>
          </a>

          <nav className="tpl-nav-links" aria-label="Main">
            <a href="#product">Product</a>
            <a href="#how">How it works</a>
            <a href="#security">Security</a>
            <a href="#deploy">Deployment</a>
          </nav>

          <div className="tpl-nav-actions">
            <button type="button" className="tpl-btn tpl-btn-ghost" onClick={onLogin}>
              Sign in
            </button>
            <button type="button" className="tpl-btn tpl-btn-primary" onClick={onGetStarted}>
              Get started
            </button>
          </div>
        </div>
      </header>

      <main id="tpl-main">
        {/* ================= HERO ================= */}
        <section id="top" className="tpl-container tpl-hero">
          <p className="tpl-kicker">
            <span className="tpl-dot" aria-hidden="true" />
            Remote support for IT teams
          </p>

          <h1>See the problem before you take the screen.</h1>

          <p className="tpl-lead">
            Endpoint health, security findings, a remote shell and full remote
            control in one browser console. Start with the signal. Take over
            only when you need to.
          </p>

          <div className="tpl-hero-actions">
            <button type="button" className="tpl-btn tpl-btn-primary tpl-btn-lg" onClick={onGetStarted}>
              Enroll your first device
            </button>
            <a className="tpl-btn tpl-btn-outline tpl-btn-lg" href="#how">
              See how it works
            </a>
          </div>
        </section>

        {/* ================= PRODUCT PREVIEW ================= */}
        <section className="tpl-container tpl-preview-wrap" aria-label="Product preview">
          <div className="tpl-preview">
            <div className="tpl-preview-bar">
              <div className="tpl-preview-title">
                <strong>FIN-LAPTOP-0412</strong>
                <span className="tpl-muted">Session 31</span>
                <span className="tpl-live">
                  <span className="tpl-live-dot" aria-hidden="true" />
                  Live · 42 ms · 20 fps
                </span>
              </div>

              <div className="tpl-preview-tools" aria-hidden="true">
                <span className="tpl-tool">Ctrl+Alt+Del</span>
                <span className="tpl-tool">Fullscreen</span>
                <span className="tpl-tool tpl-tool-danger">End session</span>
              </div>
            </div>

            <div className="tpl-preview-body">
              <div className="tpl-screen-col">
                <div className="tpl-screen" aria-hidden="true">
                  <div className="tpl-screen-desktop">
                    <div className="tpl-screen-side">
                      <i style={{ width: "70%" }} />
                      <i style={{ width: "55%" }} />
                      <i style={{ width: "62%" }} />
                      <i style={{ width: "48%" }} />
                    </div>
                    <div className="tpl-screen-main">
                      <i className="tpl-screen-heading" />
                      <i style={{ width: "85%" }} />
                      <i style={{ width: "78%" }} />
                      <i style={{ width: "64%" }} />
                    </div>
                  </div>
                  <div className="tpl-screen-taskbar" />
                </div>
                <p className="tpl-caption">
                  Remote screen. Mouse, keyboard and scroll go straight to the endpoint.
                </p>
              </div>

              <aside className="tpl-panel" aria-label="Device health and findings">
                <h2 className="tpl-panel-label">Device health</h2>
                <div className="tpl-metrics">
                  <div className="tpl-metric">
                    <span>CPU</span>
                    <strong>34%</strong>
                  </div>
                  <div className="tpl-metric">
                    <span>Memory</span>
                    <strong className="tpl-warn">88%</strong>
                  </div>
                  <div className="tpl-metric">
                    <span>Disk</span>
                    <strong>61%</strong>
                  </div>
                </div>

                <h2 className="tpl-panel-label">Security findings</h2>
                <div className="tpl-finding tpl-finding-high">
                  <span>Firewall off on Public</span>
                  <span>High</span>
                </div>
                <div className="tpl-finding tpl-finding-medium">
                  <span>RDP on port 3389</span>
                  <span>Medium</span>
                </div>

                <div className="tpl-shell">
                  <div>
                    <span className="tpl-shell-prompt">PS&gt;</span> Get-NetFirewallProfile
                  </div>
                  <div className="tpl-muted">Public  Enabled: False</div>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* ================= CAPABILITIES ================= */}
        <section id="product" className="tpl-band">
          <div className="tpl-container tpl-section">
            <h2 className="tpl-h2">Three ways to help, from the same console.</h2>
            <p className="tpl-sub">
              Most support tools start and end with the screen. TechAIPILOT
              gives you the quieter options first, so you interrupt the
              employee only when it actually helps.
            </p>

            <div className="tpl-cards">
              {CAPABILITIES.map((item) => (
                <article key={item.title} className="tpl-card">
                  <svg
                    aria-hidden="true"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {item.icon}
                  </svg>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section id="how" className="tpl-container tpl-section tpl-section-tight">
          <h2 className="tpl-h2">From enrollment to fixed, in four steps.</h2>

          <ol className="tpl-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="tpl-step">
                <span className="tpl-step-num">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ================= SECURITY ================= */}
        <section id="security" className="tpl-band tpl-band-raised">
          <div className="tpl-container tpl-section tpl-split">
            <div className="tpl-split-intro">
              <h2 className="tpl-h2">Built for the people who have to approve it.</h2>
              <p className="tpl-sub">
                Remote access touches every employee's screen. TechAIPILOT
                keeps control with your organisation, not with whoever has a
                session ID.
              </p>
            </div>

            <div className="tpl-trust">
              {TRUST.map((item) => (
                <div key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= DEPLOYMENT ================= */}
        <section id="deploy" className="tpl-container tpl-section tpl-split tpl-split-center">
          <div className="tpl-split-intro">
            <h2 className="tpl-h2">Run it where your data has to live.</h2>
            <p className="tpl-sub">
              The console and API are a standard web app with a PostgreSQL
              database. Use a hosted instance, or run it on your own servers
              so screen streams and telemetry never leave your network.
            </p>
          </div>

          <dl className="tpl-stack">
            {STACK.map((item) => (
              <div key={item.label} className="tpl-stack-item">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ================= CTA ================= */}
        <section className="tpl-container tpl-cta-wrap">
          <div className="tpl-cta">
            <div>
              <h2>Enroll one device and see its health in minutes.</h2>
              <p>Create your workspace, generate an enrollment code, run the installer.</p>
            </div>

            <div className="tpl-cta-actions">
              <button type="button" className="tpl-btn tpl-btn-outline tpl-btn-lg" onClick={onLogin}>
                Sign in
              </button>
              <button type="button" className="tpl-btn tpl-btn-primary tpl-btn-lg" onClick={onGetStarted}>
                Create workspace
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="tpl-footer">
        <div className="tpl-container tpl-footer-inner">
          <span>© {new Date().getFullYear()} TechAIPILOT</span>
          <span>Secure remote support for Windows endpoints</span>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
