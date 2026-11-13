import { useEffect } from "react";
import type { ReactNode } from "react";

import Logo from "./Logo";

type Page = "home" | "devices" | "network-security";

type SidebarProps = {
  page: Page;
  email: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
};

type NavigationItem = {
  key: Page;
  label: string;
  icon: ReactNode;
};

const NAVIGATION: NavigationItem[] = [
  {
    key: "home",
    label: "Home",
    icon: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </>
    ),
  },
  {
    key: "devices",
    label: "Devices",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
        <path d="M12 16v4" />
      </>
    ),
  },
  {
    key: "network-security",
    label: "Network security",
    icon: (
      <>
        <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function Sidebar({
  page,
  email,
  mobileOpen,
  onCloseMobile,
  onNavigate,
  onLogout,
}: SidebarProps) {
  // Escape closes the mobile drawer; lock page scroll while it is open.
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseMobile();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [mobileOpen, onCloseMobile]);

  const handleNavigate = (nextPage: Page) => {
    onNavigate(nextPage);
    onCloseMobile();
  };

  const initials = email.slice(0, 2).toUpperCase();

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="tpa-backdrop"
          onClick={onCloseMobile}
          aria-label="Close navigation"
        />
      )}

      <aside
        id="tpa-sidebar"
        className={`tpa-sidebar ${mobileOpen ? "is-open" : ""}`}
        aria-label="Primary navigation"
      >
        <div className="tpa-sidebar-top">
          <button
            type="button"
            className="tpa-brand"
            onClick={() => handleNavigate("home")}
            aria-label="TechAIPILOT home"
          >
            <Logo size={30} />
            <span className="tpa-brand-name">TechAIPILOT</span>
          </button>

          <button
            type="button"
            className="tpa-icon-btn tpa-sidebar-close"
            onClick={onCloseMobile}
            aria-label="Close navigation"
          >
            <Icon>
              <path d="M6 6l12 12M18 6 6 18" />
            </Icon>
          </button>
        </div>

        <nav className="tpa-nav" aria-label="Workspace">
          <p className="tpa-nav-label">Workspace</p>

          {NAVIGATION.map((item) => {
            const active = page === item.key;

            return (
              <button
                key={item.key}
                type="button"
                className={`tpa-nav-item ${active ? "is-active" : ""}`}
                onClick={() => handleNavigate(item.key)}
                aria-current={active ? "page" : undefined}
              >
                <Icon>{item.icon}</Icon>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="tpa-sidebar-bottom">
          <div className="tpa-account">
            <span className="tpa-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="tpa-account-email" title={email}>
              {email}
            </span>
          </div>

          <button type="button" className="tpa-signout" onClick={onLogout}>
            <Icon>
              <path d="M15 4h4v16h-4" />
              <path d="M10 8l-4 4 4 4" />
              <path d="M6 12h10" />
            </Icon>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
