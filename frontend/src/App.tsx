import {
  useEffect,
  useState,
} from "react";

import Home from "./pages/Home";
import Devices from "./pages/Devices";
import DeviceDetails from "./pages/DeviceDetails";
import RemoteSession from "./pages/RemoteSession";
import Login from "./pages/login";
import CreateAccount from "./pages/CreateAccount";

import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

import {
  getCurrentUser,
} from "./api";

import type {
  User,
} from "./api";

export type Page =
  | "home"
  | "devices";

type AuthScreen =
  | "login"
  | "register";

const TOKEN_KEY =
  "techpilot_access_token";

const pageTitles: Record<
  Page,
  string
> = {
  home: "Home",
  devices: "Devices",
};

const pageDescriptions: Record<
  Page,
  string
> = {
  home:
    "Secure remote support for your connected endpoints.",
  devices:
    "View connected TechPilot agents and start remote support sessions.",
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

  const [page, setPage] =
    useState<Page>("home");

  const [query, setQuery] =
    useState("");

  const [selectedDeviceId, setSelectedDeviceId] =
    useState<string | null>(null);

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
    setAuthScreen("login");
  };

  const handleNavigate = (
    nextPage: Page,
  ) => {
    setPage(nextPage);
    setQuery("");
    setSelectedDeviceId(null);
  };

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
      />
    );
  }

  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-card">
          <div className="auth-loading-mark">
            TP
          </div>

          <strong>
            TECHPILOT
          </strong>

          <span>
            VERIFYING SECURE SESSION...
          </span>
        </div>
      </div>
    );
  }

  if (!token || !currentUser) {
    if (
      authScreen === "register"
    ) {
      return (
        <CreateAccount
          onRegisterSuccess={
            handleAuthenticated
          }
          onLogin={() =>
            setAuthScreen("login")
          }
        />
      );
    }

    return (
      <Login
        onLoginSuccess={
          handleAuthenticated
        }
        onCreateAccount={() =>
          setAuthScreen("register")
        }
      />
    );
  }

  const renderPage = () => {
    if (page === "home") {
      return (
        <Home
          onNavigate={() =>
            handleNavigate("devices")
          }
        />
      );
    }

    if (selectedDeviceId) {
      return (
        <DeviceDetails
          deviceId={selectedDeviceId}
          onBack={() =>
            setSelectedDeviceId(null)
          }
        />
      );
    }

    return (
      <Devices
        searchQuery={query}
        onDeviceSelect={
          setSelectedDeviceId
        }
      />
    );
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
        email={currentUser.email}
        onNavigate={
          handleNavigate
        }
        onLogout={handleLogout}
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
                {
                  pageDescriptions[
                    page
                  ]
                }
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