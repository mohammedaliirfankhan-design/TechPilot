import { useState } from "react";

import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import DeviceDetails from "./pages/DeviceDetails";
import Diagnostics from "./pages/Diagnostics";
import Incidents from "./pages/Incidents";
import Automation from "./pages/Automation";
import AuditLogs from "./pages/AuditLogs";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

export type Page =
  | "dashboard"
  | "devices"
  | "diagnostics"
  | "incidents"
  | "automation"
  | "audit"
  | "reports"
  | "settings";

const pageTitles: Record<Page, string> = {
  dashboard: "Dashboard",
  devices: "Devices",
  diagnostics: "Diagnostics",
  incidents: "Incidents",
  automation: "Automation",
  audit: "Audit Logs",
  reports: "Reports",
  settings: "Settings",
};

const pageDescriptions: Record<Page, string> = {
  dashboard:
    "Real-time visibility across devices, diagnostics, incidents, security and automated remediation.",
  devices:
    "Monitor endpoint health, resources, identity and connectivity across your environment.",
  diagnostics:
    "Investigate endpoint health and identify the likely causes of operational issues.",
  incidents:
    "Track active incidents and move from detection to resolution with complete visibility.",
  automation:
    "Manage governed remediation workflows and controlled endpoint actions.",
  audit:
    "Review security, administrative, device and automation activity across the workspace.",
  reports:
    "Understand operational trends and platform performance through centralized reporting.",
  settings:
    "Manage your TechPilot workspace, platform behavior, notifications and security.",
};

const isPage = (value: string): value is Page =>
  value in pageTitles;

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [query, setQuery] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] =
    useState<string | null>(null);

  const handleNavigate = (nextPage: Page) => {
    setPage(nextPage);
    setQuery("");

    if (nextPage !== "devices") {
      setSelectedDeviceId(null);
    }
  };

  const handleDashboardNavigate = (section: string) => {
    if (isPage(section)) {
      handleNavigate(section);
    }
  };

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return (
          <Dashboard
            onNavigate={handleDashboardNavigate}
          />
        );

      case "devices":
        return selectedDeviceId ? (
          <DeviceDetails
            deviceId={selectedDeviceId}
            onBack={() => setSelectedDeviceId(null)}
          />
        ) : (
          <Devices
            searchQuery={query}
            onDeviceSelect={setSelectedDeviceId}
          />
        );

      case "diagnostics":
        return <Diagnostics />;

      case "incidents":
        return <Incidents />;

      case "automation":
        return <Automation />;

      case "audit":
        return <AuditLogs />;

      case "reports":
        return <Reports />;

      case "settings":
        return <Settings />;

      default:
        return null;
    }
  };

  return (
    <div className="techpilot-app">
      <div className="background-grid" aria-hidden="true" />

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
                TECHPILOT / {pageTitles[page].toUpperCase()}
              </div>

              <h1>{pageTitles[page]}</h1>

              <p>{pageDescriptions[page]}</p>
            </div>

            <div className="page-header-status">
              <span className="pulse-dot" />
              <span>ALL SYSTEMS OPERATIONAL</span>
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