import { useEffect, useState } from "react";

import ScrollReveal from "../components/ScrollReveal";
import { getAgents, type Agent } from "../api";

type HomeProps = {
  onNavigate: (page: "devices") => void;
};

function Home({ onNavigate }: HomeProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      try {
        const data = await getAgents();

        if (!cancelled) {
          setAgents(data);
        }
      } catch {
        if (!cancelled) {
          setAgents([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAgents();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="home-experience">
      <ScrollReveal delay={0}>
        <section className="home-hero glass-card">
          <div className="home-hero-copy">
            <span className="eyebrow">
              TECHPILOT // REMOTE SUPPORT
            </span>

            <h2>
              Secure remote support,
              <br />
              without the complexity.
            </h2>

            <p>
              Manage your connected endpoints and
              securely access remote machines from
              one focused workspace.
            </p>

            <div className="home-actions">
              <button
                type="button"
                className="techpilot-primary-button"
                onClick={() => onNavigate("devices")}
              >
                <span>▣</span>
                VIEW DEVICES
              </button>

              <div className="home-status">
                <i />
                REMOTE SUPPORT READY
              </div>
            </div>
          </div>

          <div className="home-hero-mark" aria-hidden="true">
            <span>TP</span>
            <i />
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal delay={80}>
        <section className="home-overview">
          <div className="home-overview-card glass-card">
            <span>CONNECTED ENDPOINTS</span>

            <strong>
              {loading
                ? "--"
                : agents.length.toString().padStart(2, "0")}
            </strong>

            <small>
              Registered TechPilot agents
            </small>
          </div>

          <div className="home-overview-card glass-card">
            <span>REMOTE ACCESS</span>

            <strong>READY</strong>

            <small>
              Secure remote sessions available
            </small>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal delay={140}>
        <section className="home-next glass-card">
          <div>
            <span className="eyebrow">
              QUICK ACCESS
            </span>

            <h3>
              Manage your endpoints
            </h3>

            <p>
              Open the device inventory to view
              registered agents and start a remote
              support session.
            </p>
          </div>

          <button
            type="button"
            className="techpilot-secondary-button"
            onClick={() => onNavigate("devices")}
          >
            OPEN DEVICE INVENTORY
            <span>→</span>
          </button>
        </section>
      </ScrollReveal>
    </div>
  );
}

export default Home;