import {
  useEffect,
  useState,
} from "react";

type Page =
  | "home"
  | "devices";

type TopbarProps = {
  page: Page;
  title: string;
  query: string;
  onQueryChange: (query: string) => void;
  onLogout: () => void;
};

function Topbar({
  page,
  title,
  query,
  onQueryChange,
  onLogout,
}: TopbarProps) {
  const [clock, setClock] =
    useState("");

  const [isSearchFocused, setIsSearchFocused] =
    useState(false);

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Intl.DateTimeFormat(
          "en-IN",
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          },
        ).format(new Date()),
      );
    };

    updateClock();

    const interval =
      window.setInterval(
        updateClock,
        1000,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, []);

  useEffect(() => {
    const handleShortcut = (
      event: KeyboardEvent,
    ) => {
      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key.toLowerCase() ===
          "k"
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
    page === "home"
      ? "SYS"
      : "END";

  return (
    <header className="topbar futuristic-topbar">
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

      <div className="top-actions futuristic-top-actions">
        {page === "devices" && (
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
              âŒ•
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
        )}

        <div className="top-system-clock">
          <span>LOCAL TIME</span>

          <strong>
            {clock || "--:--:--"}
          </strong>
        </div>

        <button
          type="button"
          className="topbar-logout-button"
          onClick={onLogout}
          aria-label="Log out"
        >
          <span aria-hidden="true">↪</span>
          LOG OUT
        </button>
      </div>
    </header>
  );
}

export default Topbar;