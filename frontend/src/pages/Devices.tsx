import {
  useEffect,
  useMemo,
  useState,
} from "react";

import ScrollReveal from "../components/ScrollReveal";
import {
  getAgents,
  type Agent,
} from "../api";

type DevicesProps = {
  searchQuery?: string;
  onDeviceSelect?: (deviceId: string) => void;
};

function Devices({
  searchQuery = "",
  onDeviceSelect,
}: DevicesProps) {
  const [agents, setAgents] =
    useState<Agent[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      try {
        setLoading(true);
        setError(null);

        const data = await getAgents();

        if (!cancelled) {
          setAgents(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load devices.",
          );
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

  const filteredAgents = useMemo(() => {
    const query =
      searchQuery.trim().toLowerCase();

    if (!query) {
      return agents;
    }

    return agents.filter((agent) =>
      [
        agent.hostname,
        agent.device_id,
        agent.operating_system,
        agent.os_version,
      ].some((value) =>
        value
          .toLowerCase()
          .includes(query),
      ),
    );
  }, [agents, searchQuery]);

  return (
    <div className="devices-clean">
      <ScrollReveal delay={0}>
        <section className="devices-clean-header">
          <div>
            <span className="eyebrow">
              ENDPOINT INVENTORY
            </span>

            <h2>
              Connected Devices
            </h2>

            <p>
              Select an endpoint to view its
              details and start secure remote
              support.
            </p>
          </div>

          <div className="devices-count">
            <span>REGISTERED</span>

            <strong>
              {agents.length
                .toString()
                .padStart(2, "0")}
            </strong>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal delay={60}>
        <section className="devices-list glass-card">
          {loading && (
            <div className="devices-empty">
              <span className="devices-loading-dot" />

              <strong>
                Loading endpoints...
              </strong>

              <p>
                Synchronizing with the
                TechPilot agent API.
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="devices-empty devices-error">
              <strong>
                Unable to load endpoints
              </strong>

              <p>{error}</p>
            </div>
          )}

          {!loading &&
            !error &&
            filteredAgents.length === 0 && (
              <div className="devices-empty">
                <strong>
                  No connected endpoints
                </strong>

                <p>
                  No registered TechPilot agents
                  match your search.
                </p>
              </div>
            )}

          {!loading &&
            !error &&
            filteredAgents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className="device-list-item"
                onClick={() =>
                  onDeviceSelect?.(
                    agent.device_id,
                  )
                }
              >
                <div className="device-list-status">
                  <i />
                </div>

                <div className="device-list-main">
                  <span className="device-list-eyebrow">
                    ENDPOINT
                  </span>

                  <strong>
                    {agent.hostname}
                  </strong>

                  <span className="device-list-id">
                    {agent.device_id}
                  </span>
                </div>

                <div className="device-list-meta">
                  <span>
                    OPERATING SYSTEM
                  </span>

                  <strong>
                    {agent.operating_system}
                  </strong>

                  <small>
                    {agent.os_version}
                  </small>
                </div>

                <div className="device-list-meta">
                  <span>
                    AGENT
                  </span>

                  <strong>
                    v{agent.agent_version}
                  </strong>

                  <small>
                    Registered
                  </small>
                </div>

                <div className="device-list-action">
                  <span>
                    REMOTE SUPPORT
                  </span>

                  <strong>
                    OPEN →
                  </strong>
                </div>
              </button>
            ))}
        </section>
      </ScrollReveal>
    </div>
  );
}

export default Devices;