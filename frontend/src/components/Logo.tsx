type LogoProps = {
  size?: number;
  // Give a title when the logo stands alone; leave it out when the
  // product name is printed next to it (the mark is then decorative).
  title?: string;
};

// TechAIPILOT mark: a screen with a cursor reaching in from outside.
function Logo({ size = 30, title }: LogoProps) {
  const small = size <= 20;

  return (
    <svg
      className="tp-logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="15"
        fill="var(--tp-raised)"
        stroke="var(--tp-line-strong)"
        strokeWidth="1.5"
      />
      <rect
        x="12"
        y="15"
        width="36"
        height="25"
        rx="4"
        fill="none"
        stroke="var(--tp-text)"
        strokeWidth={small ? 5 : 4}
      />
      {!small && (
        <path
          d="M24 48h12"
          stroke="var(--tp-text)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
      <path
        d="M36 28l17 7-7 2.4-2.6 7z"
        fill="var(--tp-accent)"
        stroke={small ? "none" : "var(--tp-raised)"}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default Logo;
