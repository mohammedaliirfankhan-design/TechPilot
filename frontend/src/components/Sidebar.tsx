import { useEffect, useState } from "react";

type Page =
  | "home"
  | "devices";

type SidebarProps = {
  page: Page;
  email: string;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
};

type NavigationItem = {
  key: Page;
  label: string;
  icon: string;
  code: string;
};

const navigation: NavigationItem[] = [
  {
    key: "home",
    label: "Home",
    icon: "⌂",
    code: "SYS",
  },
  {
    key: "devices",
    label: "Devices",
    icon: "▣",
    code: "END",
  },
];

function Sidebar({
  page,
  email,
  onNavigate,
  onLogout,
}: SidebarProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      document.body.style.overflow = "";
    };
  }, [open]);

  const handleNavigate = (nextPage: Page) => {
    onNavigate(nextPage);
    setOpen(false);
  };

  const handleLogout = () => {
    setOpen(false);
    onLogout();
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          className="sidebar-menu-button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={false}
          aria-controls="techpilot-sidebar"
        >
          <span />
          <span />
          <span />
        </button>
      )}

      {open && (
        <button
          type="button"
          className="sidebar-backdrop visible"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside
        id="techpilot-sidebar"
        className={`sidebar futuristic-sidebar ${
          open
            ? "sidebar-open"
            : "sidebar-closed"
        }`}
        aria-label="Primary navigation"
        aria-hidden={!open}
      >
        <div className="brand futuristic-brand">
          <button
            type="button"
            className="brand-button"
            onClick={() =>
              handleNavigate("home")
            }
            aria-label="Go to TechPilot home"
          >
            <div
              className="brand-mark futuristic-brand-mark"
              aria-hidden="true"
            >
              <span>TP</span>
              <i />
            </div>

            <div className="brand-copy">
              <strong>TECHPILOT</strong>
              <span>REMOTE SUPPORT</span>
            </div>
          </button>

          {open && (
            <button
              type="button"
              className="sidebar-close-button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              ×
            </button>
          )}

          <div className="brand-status">
            <span />
            ONLINE
          </div>
        </div>

        <div className="workspace-label">
          <span>WORKSPACE</span>
          <i />
        </div>

        <nav
          className="navigation futuristic-navigation"
          aria-label="Workspace navigation"
        >
          {navigation.map((item) => {
            const isActive =
              page === item.key;

            return (
              <button
                key={item.key}
                type="button"
                className={`nav-item futuristic-nav-item ${
                  isActive ? "active" : ""
                }`}
                onClick={() =>
                  handleNavigate(item.key)
                }
                aria-current={
                  isActive
                    ? "page"
                    : undefined
                }
              >
                <span className="nav-icon">
                  {item.icon}
                </span>

                <span className="nav-label-group">
                  <span className="nav-label">
                    {item.label}
                  </span>
                </span>

                <span className="nav-code">
                  {item.code}
                </span>

                <span
                  className="nav-active-line"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </nav>

        <div className="sidebar-live-panel">
          <div className="sidebar-live-header">
            <span>CONNECTION</span>
            <i />
          </div>

          <div className="sidebar-live-core">
            <span className="status-dot" />

            <div>
              <strong>
                Remote support ready
              </strong>

              <span>
                TechPilot workspace online
              </span>
            </div>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="profile futuristic-profile">
            <div className="avatar futuristic-avatar">
              {email
                .slice(0, 2)
                .toUpperCase()}
            </div>

            <div className="profile-copy">
              <strong>Account</strong>

              <span>{email}</span>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-logout-button"
            onClick={handleLogout}
          >
            <span>↪</span>
            LOG OUT
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;