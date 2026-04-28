/**
 * Tiny presentational primitives used by several pieces of the IP-lookup
 * UI. Kept in one file (rather than three) because each is a single
 * function with no internal state — splitting them further would just
 * add import noise.
 */

/** Labelled value cell used throughout the result grid. */
export function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={`text-sm break-words ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}

/** Pill-style external link with consistent target/rel and ↗ glyph. */
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-bg-elevated px-2.5 py-1 text-xs text-fg-muted hover:bg-brand/10 hover:text-brand transition"
    >
      {children} ↗
    </a>
  );
}

/**
 * Threat-flag pill. `good` flips the colour semantics: for "residential"
 * a `true` is positive, while for "tor" / "vpn" / "proxy" a `true` is
 * negative.
 */
export function ThreatPill({
  label,
  v,
  good,
}: {
  label: string;
  v: boolean;
  good?: boolean;
}) {
  const positive = good ? v : !v;
  return (
    <div className="flex items-center justify-between rounded-md bg-bg-elevated px-2.5 py-1">
      <span className="text-fg-muted">{label}</span>
      <span className={positive ? "text-success text-xs" : "text-danger text-xs"}>
        {v ? "yes" : "no"}
      </span>
    </div>
  );
}
