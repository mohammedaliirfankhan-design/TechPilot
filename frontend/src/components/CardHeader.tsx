type CardHeaderProps = {
  title: string;
  subtitle: string;
  action: string;
  onAction?: () => void;
};

function CardHeader({
  title,
  subtitle,
  action,
  onAction,
}: CardHeaderProps) {
  const hasAction = Boolean(action);

  return (
    <div className="card-header futuristic-card-header">
      <div className="card-header-title-group">
        <div className="card-header-accent">
          <span />
          <span />
          <span />
        </div>

        <div>
          <div className="card-header-kicker">
            TECHPILOT // TELEMETRY
          </div>

          <h2>{title}</h2>

          <p>{subtitle}</p>
        </div>
      </div>

      {hasAction && (
        <button
          type="button"
          className="card-action futuristic-card-action"
          onClick={onAction}
          disabled={!onAction}
          aria-label={action}
        >
          <span>{action}</span>
          <span className="card-action-arrow">
            →
          </span>

          <span
            className="card-action-scan"
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}

export default CardHeader;