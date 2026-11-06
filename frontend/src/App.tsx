import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Home from "./pages/Home";
import Devices from "./pages/Devices";
import DeviceDetails from "./pages/DeviceDetails";
import NetworkSecurity from "./pages/NetworkSecurity";
import RemoteSession from "./pages/RemoteSession";
import Login from "./pages/login";
import CreateAccount from "./pages/CreateAccount";
import Landing from "./pages/Landing";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

import {
  getCurrentUser,
} from "./api";

import type {
  User,
} from "./api";

import "./tokens.css";
import "./shell.css";

type Page = "home" | "devices" | "network-security";

type AuthScreen =
  | "login"
  | "register";

const TOKEN_KEY =
  "techpilot_access_token";

const pageTitles: Record<Page, string> = {
  home: "Home",
  devices: "Devices",
  "network-security": "Network security",
};

const pageDescriptions: Record<Page, string> = {
  home: "An overview of your enrolled devices and their network findings.",
  devices: "Enrolled TechAIPILOT agents. Open a device to start a shell or a remote session.",
  "network-security": "Firewall state, listeners and connections reported by your devices.",
};

function App() {
  const remoteParams =
    new URLSearchParams(
      window.location.search,
    );

  const remoteSessionId =
    remoteParams.get(
      "remote_session",
    );

  const [token, setToken] =
    useState<string | null>(() =>
      localStorage.getItem(
        TOKEN_KEY,
      ),
    );

  const [currentUser, setCurrentUser] =
    useState<User | null>(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [authScreen, setAuthScreen] =
    useState<AuthScreen>("login");

  const [showLanding, setShowLanding] =
    useState(true);

  const [page, setPage] =
    useState<Page>("home");

  const [query, setQuery] =
    useState("");

  const [selectedDeviceId, setSelectedDeviceId] =
    useState<string | null>(null);

  const [navOpen, setNavOpen] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    const validateSession =
      async () => {
        const storedToken =
          localStorage.getItem(
            TOKEN_KEY,
          );

        if (!storedToken) {
          if (!cancelled) {
            setToken(null);
            setCurrentUser(null);
            setAuthLoading(false);
          }

          return;
        }

        try {
          const user =
            await getCurrentUser(
              storedToken,
            );

          if (cancelled) {
            return;
          }

          setToken(storedToken);
          setCurrentUser(user);
        } catch {
          localStorage.removeItem(
            TOKEN_KEY,
          );

          if (!cancelled) {
            setToken(null);
            setCurrentUser(null);
            setAuthScreen("login");
            setShowLanding(true);
          }
        } finally {
          if (!cancelled) {
            setAuthLoading(false);
          }
        }
      };

    void validateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = (
    accessToken: string,
  ) => {
    localStorage.setItem(
      TOKEN_KEY,
      accessToken,
    );

    setToken(accessToken);

    void getCurrentUser(
      accessToken,
    )
      .then((user) => {
        setCurrentUser(user);
        setAuthLoading(false);
      })
      .catch(() => {
        localStorage.removeItem(
          TOKEN_KEY,
        );

        setToken(null);
        setCurrentUser(null);
        setAuthScreen("login");
        setShowLanding(true);
        setAuthLoading(false);
      });
  };

  const handleLogout = () => {
    localStorage.removeItem(
      TOKEN_KEY,
    );

    setToken(null);
    setCurrentUser(null);
    setSelectedDeviceId(null);
    setQuery("");
    setPage("home");
    setNavOpen(false);
    setAuthScreen("login");
    setShowLanding(true);
  };

  const handleNavigate = (
    nextPage: Page,
  ) => {
    setPage(nextPage);
    setQuery("");
    setSelectedDeviceId(null);
  };

  const handleOpenDevice = (
    deviceId: string,
  ) => {
    setPage("devices");
    setQuery("");
    setSelectedDeviceId(deviceId);
  };

  const closeNav = useCallback(
    () => setNavOpen(false),
    [],
  );

  if (authLoading) {
    return (
      <div className="tpa-loading" role="status">
        <span className="tpa-brand-mark" aria-hidden="true">
          <span />
        </span>
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!token || !currentUser) {
    if (showLanding) {
      return (
        <Landing
          onGetStarted={() => {
            setShowLanding(false);
            setAuthScreen("register");
          }}
          onLogin={() => {
            setShowLanding(false);
            setAuthScreen("login");
          }}
        />
      );
    }

    if (authScreen === "register") {
      return (
        <CreateAccount
          onRegisterSuccess={
            handleAuthenticated
          }
          onLogin={() => {
            setAuthScreen("login");
          }}
          onBack={() => setShowLanding(true)}
        />
      );
    }

    return (
      <Login
        onLoginSuccess={
          handleAuthenticated
        }
        onCreateAccount={() => {
          setAuthScreen("register");
        }}
        onBack={() => setShowLanding(true)}
      />
    );
  }

  if (
    remoteSessionId &&
    Number.isFinite(
      Number(remoteSessionId),
    )
  ) {
    return (
      <RemoteSession
        sessionId={Number(
          remoteSessionId,
        )}
        token={token}
      />
    );
  }

  const renderPage = () => {
    if (page === "home") {
      return (
        <Home
          token={token}
          onNavigate={handleNavigate}
          onOpenDevice={handleOpenDevice}
        />
      );
    }

    if (page === "network-security") {
      return <NetworkSecurity token={token} />;
    }

    if (selectedDeviceId) {
      return (
        <DeviceDetails
          deviceId={selectedDeviceId}
          token={token}
          onBack={() =>
            setSelectedDeviceId(null)
          }
        />
      );
    }

    return (
      <Devices
        searchQuery={query}
        token={token}
        onDeviceSelect={
          setSelectedDeviceId
        }
      />
    );
  };

  return (
    <div className="tpa">
      <a className="tpa-skip" href="#tpa-content">
        Skip to content
      </a>

      <Sidebar
        page={page}
        email={currentUser.email}
        mobileOpen={navOpen}
        onCloseMobile={closeNav}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />

      <div className="tpa-main">
        <Topbar
          page={page}
          title={pageTitles[page]}
          query={query}
          onQueryChange={setQuery}
          onOpenNav={() => setNavOpen(true)}
        />

        <main id="tpa-content" className="tpa-content">
          <header className="tpa-page-header">
            <h1>{pageTitles[page]}</h1>
            <p>{pageDescriptions[page]}</p>
          </header>

          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
