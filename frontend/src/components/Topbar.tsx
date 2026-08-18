import { useEffect, useState } from "react";

type Page =
  | "dashboard"
  | "devices"
  | "diagnostics"
  | "incidents"
  | "automation"
  | "audit"
  | "reports"
  | "settings";

type TopbarProps = {
  page: Page;
  title: string;
  query: string;
  onQueryChange: (query: string) => void;
};

function Topbar({
  page,
  title,
  query,
  onQueryChange,
}: TopbarProps) {
  const [clock, setClock] = useState("");
  const [isSearchFocused, setIsSearchFocused] =
    useState(false);

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Intl.DateTimeFormat("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };

    updateClock();

    const interval = window.setInterval(
      updateClock,
      1000,
    );

    return () =>
      window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleShortcut = (
      event: KeyboardEvent,
    ) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();

        const input =
          document.querySelector<HTMLInputElement>(
            ".topbar .search input",
          );

        input?.focus();
      }

      if (
        event.key === "Escape" &&
        document.activeElement instanceof
          HTMLInputElement
      ) {
        document.activeElement.blur();
      }
    };

    window.addEventListener(
      "keydown",
      handleShortcut,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleShortcut,
      );
  }, []);

  const pageCode =
    page === "dashboard"
      ? "SYS"
      : page === "devices"
        ? "END"
        : page === "diagnostics"
          ? "DGN"
          : page === "incidents"
            ? "INC"
            : page === "automation"
              ? "AUT"
              : page === "audit"
                ? "SEC"
                : page === "reports"
                  ? "RPT"
                  : "CFG";

  return (
    <header className="topbar futuristic-topbar">
      {/* =====================================================
          BREADCRUMB / SYSTEM PATH
          ===================================================== */}

      <div className="breadcrumbs futuristic-breadcrumbs">
        <span className="breadcrumb-system">
          TECHPILOT
        </span>

        <b>/</b>

        <span className="breadcrumb-code">
          {pageCode}
        </span>

        <b>/</b>

        <strong>{title}</strong>

        <span className="breadcrumb-status">
          <i />
          LIVE
        </span>
      </div>

      {/* =====================================================
          TOP ACTIONS
          ===================================================== */}

      <div className="top-actions futuristic-top-actions">
        {/* SEARCH */}

        <div
          className={`search futuristic-search ${
            isSearchFocused
              ? "search-focused"
              : ""
          }`}
        >
          <span
            className="search-icon"
            aria-hidden="true"
          >
            ⌕
          </span>

          <input
            type="text"
            value={query}
            onChange={(event) =>
              onQueryChange(
                event.target.value,
              )
            }
            onFocus={() =>
              setIsSearchFocused(true)
            }
            onBlur={() =>
              setIsSearchFocused(false)
            }
            placeholder="Search devices..."
            aria-label="Search devices"
          />

          <span className="search-scan-line" />

          <span className="search-shortcut">
            Ctrl K
          </span>
        </div>

        {/* SYSTEM CLOCK */}

        <div className="top-system-clock">
          <span>LOCAL TIME</span>
          <strong>
            {clock || "--:--:--"}
          </strong>
        </div>

        {/* NOTIFICATIONS */}

        <button
          type="button"
          className="top-icon-button futuristic-top-icon"
          aria-label="Notifications"
        >
          <span>♢</span>

          <i className="notification-dot" />

          <span className="top-icon-pulse" />
        </button>

        {/* ACCOUNT */}

        <button
          type="button"
          className="top-avatar futuristic-top-avatar"
          aria-label="Account"
        >
          <span>AM</span>
          <i />
        </button>
      </div>
    </header>
  );
}

export default Topbar;