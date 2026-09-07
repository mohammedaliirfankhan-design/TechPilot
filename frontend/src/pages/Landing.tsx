type LandingProps = {
  onGetStarted: () => void;
  onLogin: () => void;
};

function Landing({
  onGetStarted,
  onLogin,
}: LandingProps) {
  return (
    <div className="landing-page">
      <div
        className="landing-background-grid"
        aria-hidden="true"
      />

      <div
        className="landing-glow landing-glow-one"
        aria-hidden="true"
      />

      <div
        className="landing-glow landing-glow-two"
        aria-hidden="true"
      />

      <nav className="landing-nav">
        <div className="landing-logo">
          <div className="landing-logo-mark">
            TP
          </div>

          <div>
            <strong>TECHAIPILOT</strong>
            <span>SECURE REMOTE SUPPORT</span>
          </div>
        </div>

        <div className="landing-nav-actions">
          <button
            type="button"
            className="landing-login-button"
            onClick={onLogin}
          >
            Sign In
          </button>

          <button
            type="button"
            className="landing-nav-cta"
            onClick={onGetStarted}
          >
            Get Started
          </button>
        </div>
      </nav>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="landing-eyebrow">
              <span className="landing-eyebrow-dot" />
              INTELLIGENT ENDPOINT OPERATIONS
            </div>

            <h1>
              Remote Support.
              <br />
              <span>Intelligent by Design.</span>
            </h1>

            <p>
              Securely connect, monitor, diagnose, and
              remotely support your endpoints from
              anywhere with TechAIPILOT.
            </p>

            <div className="landing-hero-actions">
              <button
                type="button"
                className="landing-primary-button"
                onClick={onGetStarted}
              >
                Get Started
                <span>→</span>
              </button>

              <button
                type="button"
                className="landing-secondary-button"
                onClick={onLogin}
              >
                Sign In
              </button>
            </div>

            <div className="landing-trust-line">
              <span className="pulse-dot" />
              SECURE REMOTE ACCESS
              <span className="landing-divider" />
              REAL-TIME ENDPOINT VISIBILITY
            </div>
          </div>

          <div
            className="landing-visual"
            aria-hidden="true"
          >
            <div className="landing-orbit landing-orbit-one" />
            <div className="landing-orbit landing-orbit-two" />

            <div className="landing-core">
              <div className="landing-core-inner">
                <span>TP</span>
                <small>CONNECTED</small>
              </div>
            </div>

            <div className="landing-node landing-node-one">
              <span />
              DEVICE
            </div>

            <div className="landing-node landing-node-two">
              <span />
              SESSION
            </div>

            <div className="landing-node landing-node-three">
              <span />
              TELEMETRY
            </div>

            <div className="landing-connection landing-connection-one" />
            <div className="landing-connection landing-connection-two" />
            <div className="landing-connection landing-connection-three" />
          </div>
        </section>

        <section className="landing-capabilities">
          <div className="landing-section-heading">
            <span>THE TECHAIPILOT PLATFORM</span>
            <h2>
              Everything you need to support
              <br />
              connected endpoints.
            </h2>
          </div>

          <div className="landing-capability-grid">
            <article className="landing-capability-card">
              <div className="landing-card-number">
                01
              </div>

              <h3>Connect</h3>

              <p>
                Deploy the lightweight TechAIPILOT
                Agent and securely bring endpoints
                into your workspace.
              </p>
            </article>

            <article className="landing-capability-card">
              <div className="landing-card-number">
                02
              </div>

              <h3>Observe</h3>

              <p>
                See connected endpoints, system
                information, status, and operational
                telemetry from one interface.
              </p>
            </article>

            <article className="landing-capability-card">
              <div className="landing-card-number">
                03
              </div>

              <h3>Support</h3>

              <p>
                Start a controlled remote session and
                interact with the endpoint when support
                is required.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-how-it-works">
          <div className="landing-section-heading">
            <span>HOW IT WORKS</span>
            <h2>
              From installation to
              <br />
              remote support.
            </h2>
          </div>

          <div className="landing-steps">
            <div className="landing-step">
              <span>01</span>
              <strong>Create your account</strong>
              <p>
                Create a secure TechAIPILOT workspace
                for your endpoints.
              </p>
            </div>

            <div className="landing-step">
              <span>02</span>
              <strong>Install the Agent</strong>
              <p>
                Install TechAIPILOT on the endpoint
                you want to support.
              </p>
            </div>

            <div className="landing-step">
              <span>03</span>
              <strong>Connect your device</strong>
              <p>
                Your endpoint appears in your device
                inventory once connected.
              </p>
            </div>

            <div className="landing-step">
              <span>04</span>
              <strong>Start supporting</strong>
              <p>
                Launch a remote session whenever
                hands-on support is required.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-final-cta">
          <div>
            <span>READY WHEN YOU ARE</span>

            <h2>
              Take control of your
              <br />
              remote support workflow.
            </h2>

            <p>
              Connect your first endpoint with
              TechAIPILOT.
            </p>
          </div>

          <button
            type="button"
            className="landing-primary-button"
            onClick={onGetStarted}
          >
            Create Account
            <span>→</span>
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <div>
          <strong>TECHAIPILOT</strong>
          <span>Secure IT Remote Support</span>
        </div>

        <span>
          © 2026 TechAIPILOT
        </span>
      </footer>
    </div>
  );
}

export default Landing;