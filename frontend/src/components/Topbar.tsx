import { useEffect, useRef } from "react";

type Page = "home" | "devices" | "network-security";

type TopbarProps = {
  page: Page;
  title: string;
  query: string;
  onQueryChange: (query: string) => void;
  onOpenNav: () => void;
};

function Topbar({
  page,
  title,
  query,
  onQueryChange,
  onOpenNav,
}: TopbarProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const showSearch = page === "devices";

  // Ctrl+K / Cmd+K focuses device search.
  useEffect(() => {
    if (!showSearch) {
      return;
    }

    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleShortcut);

    return () => window.removeEventListener("keydown", handleShortcut);
  }, [showSearch]);

  return (
    <header className="tpa-topbar">
      <button
        type="button"
        className="tpa-icon-btn tpa-menu-btn"
        onClick={onOpenNav}
        aria-label="Open navigation"
        aria-controls="tpa-sidebar"
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <p className="tpa-crumbs">
        <span>Workspace</span>
        <span aria-hidden="true">/</span>
        <strong>{title}</strong>
      </p>

      {showSearch && (
        <label className="tpa-search">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="tpa-sr-only">Search devices</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
            placeholder="Search devices"
          />
          <kbd>Ctrl K</kbd>
        </label>
      )}
    </header>
  );
}

export default Topbar;
