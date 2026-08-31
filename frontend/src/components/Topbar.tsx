type Page =
  | "dashboard"
  | "devices";

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
  const pageCode =
    page === "dashboard"
      ? "SYS"
      : "END";

  return (
    <header className="topbar futuristic-topbar">
      {/* =====================================================
          SYSTEM PATH
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

        <strong>
          {title}
        </strong>

        <span className="breadcrumb-status">
          <i />
          LIVE
        </span>
      </div>

      {/* =====================================================
          TOP ACTIONS
          ===================================================== */}

      <div className="top-actions futuristic-top-actions">
        {/* DEVICE SEARCH */}

        <div className="search futuristic-search">
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
            placeholder="Search devices..."
            aria-label="Search devices"
          />

          <span className="search-scan-line" />
        </div>

        {/* LOCAL TIME */}

        <div className="top-system-clock">
          <span>LOCAL TIME</span>

          <strong>
            {new Intl.DateTimeFormat(
              "en-IN",
              {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              },
            ).format(new Date())}
          </strong>
        </div>
      </div>
    </header>
  );
}

export default Topbar;