import { useEffect, useState } from "react";

type Page =
  | "dashboard"
  | "devices";

type NavigationItem = {
  key: Page;
  label: string;
  icon: string;
  code: string;
  number: string;
};

type SidebarProps = {
  page: Page;
  onNavigate: (page: Page) => void;
};

const navigation: NavigationItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "■",
    code: "SYS",
    number: "01",
  },
  {
    key: "devices",
    label: "Devices",
    icon: "▣",
    code: "END",
    number: "02",
  },
];

function Sidebar({
  page,
  onNavigate,
}: SidebarProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
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
          tabIndex={0}
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
        {/* BRAND */}

        <div className="brand futuristic-brand">
          <button
            type="button"
            className="brand-button"
            onClick={() =>
              handleNavigate("dashboard")
            }
            aria-label="Go to TechPilot dashboard"
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

        {/* WORKSPACE */}

        <div className="workspace-label">
          <span>WORKSPACE</span>
          <i />
        </div>

        {/* NAVIGATION */}

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
                <span className="nav-number">
                  {item.number}
                </span>

                <span
                  className="nav-icon"
                  aria-hidden="true"
                >
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

        {/* SYSTEM STATUS */}

        <div className="sidebar-live-panel">
          <div className="sidebar-live-header">
            <span>SYSTEM STATUS</span>
            <i />
          </div>

          <div className="sidebar-live-core">
            <span className="status-dot" />

            <div>
              <strong>
                System operational
              </strong>

              <span>
                Remote support ready
              </span>
            </div>
          </div>

          <div className="sidebar-live-meter">
            <span />
          </div>

          <div className="sidebar-live-readout">
            <span>STATUS</span>
            <strong>READY</strong>
          </div>
        </div>

        {/* PROFILE */}

        <div className="sidebar-bottom">
          <div className="profile futuristic-profile">
            <div className="avatar futuristic-avatar">
              AM
            </div>

            <div className="profile-copy">
              <strong>
                Admin User
              </strong>

              <span>
                admin@techpilot.io
              </span>
            </div>

            <button
              type="button"
              className="profile-more"
              aria-label="Open profile options"
            >
              •••
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;