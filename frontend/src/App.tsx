import { useState } from "react";

import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import DeviceDetails from "./pages/DeviceDetails";
import RemoteSession from "./pages/RemoteSession";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

export type Page =
  | "dashboard"
  | "devices";

const pageTitles: Record<Page, string> = {
  dashboard: "Dashboard",
  devices: "Devices",
};

const pageDescriptions: Record<Page, string> = {
  dashboard:
    "Manage your TechPilot endpoints and provide secure remote support.",
  devices:
    "View registered TechPilot agents and start remote support sessions.",
};

function App() {
  const remoteParams =
    new URLSearchParams(window.location.search);

  const remoteSessionId =
    remoteParams.get("remote_session");

  const [page, setPage] =
    useState<Page>("dashboard");

  const [query, setQuery] =
    useState("");

  const [selectedDeviceId, setSelectedDeviceId] =
    useState<string | null>(null);

  /*
   * ---------------------------------------------------------
   * REMOTE SESSION
   *
   * Keep this completely separate from the normal
   * application shell.
   * ---------------------------------------------------------
   */

  if (remoteSessionId) {
    return (
      <RemoteSession
        sessionId={Number(remoteSessionId)}
      />
    );
  }

  /*
   * ---------------------------------------------------------
   * NAVIGATION
   * ---------------------------------------------------------
   */

  const handleNavigate = (nextPage: Page) => {
    setPage(nextPage);
    setQuery("");

    if (nextPage !== "devices") {
      setSelectedDeviceId(null);
    }
  };

  /*
   * ---------------------------------------------------------
   * PAGE RENDER
   * ---------------------------------------------------------
   */

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return (
          <Dashboard
            onNavigate={(section) => {
              if (
                section === "devices" ||
                section === "dashboard"
              ) {
                handleNavigate(section);
              }
            }}
          />
        );

      case "devices":
        return selectedDeviceId ? (
          <DeviceDetails
            deviceId={selectedDeviceId}
            onBack={() =>
              setSelectedDeviceId(null)
            }
          />
        ) : (
          <Devices
            searchQuery={query}
            onDeviceSelect={
              setSelectedDeviceId
            }
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="techpilot-app">
      <div
        className="background-grid"
        aria-hidden="true"
      />

      <div
        className="background-glow background-glow-one"
        aria-hidden="true"
      />

      <div
        className="background-glow background-glow-two"
        aria-hidden="true"
      />

      <Sidebar
        page={page}
        onNavigate={handleNavigate}
      />

      <div className="app-main">
        <Topbar
          page={page}
          title={pageTitles[page]}
          query={query}
          onQueryChange={setQuery}
        />

        <main className="app-content">
          <header className="page-header">
            <div className="page-header-copy">
              <div className="page-eyebrow">
                <span className="eyebrow-dot" />
                TECHPILOT /{" "}
                {pageTitles[
                  page
                ].toUpperCase()}
              </div>

              <h1>
                {pageTitles[page]}
              </h1>

              <p>
                {pageDescriptions[page]}
              </p>
            </div>

            <div className="page-header-status">
              <span className="pulse-dot" />

              <span>
                REMOTE SUPPORT READY
              </span>
            </div>
          </header>

          <section className="page-content">
            {renderPage()}
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;