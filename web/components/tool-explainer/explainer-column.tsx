type Accent = "brand" | "success" | "warn";

const ACCENTS: Record<Accent, { chip: string; bar: string; bullet: string; text: string }> = {
  brand: {
    chip:   "bg-brand/10 text-brand ring-brand/25",
    bar:    "from-brand to-transparent",
    bullet: "bg-brand/70",
    text:   "text-brand",
  },
  success: {
    chip:   "bg-success/10 text-success ring-success/25",
    bar:    "from-success to-transparent",
    bullet: "bg-success/70",
    text:   "text-success",
  },
  warn: {
    chip:   "bg-warn/10 text-warn ring-warn/25",
    bar:    "from-warn to-transparent",
    bullet: "bg-warn/70",
    text:   "text-warn",
  },
};

/**
 * One of the three columns in the tool explainer card (How it works /
 * When to use / Limits). Pure presentation: takes a heading + icon +
 * pre-split bullets and renders them as a small visual list.
 *
 * Each column gets an accent colour: brand (mechanism), success (use
 * cases), warn (limits). The accent paints the icon chip, the gradient
 * top bar above the heading, and the bullet dots — so the user can
 * triage the column by colour before reading.
 */
export function ExplainerColumn({
  icon,
  heading,
  bullets,
  accent = "brand",
}: {
  icon: React.ReactNode;
  heading: string;
  bullets: string[];
  accent?: Accent;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="relative rounded-xl border border-border bg-bg-card/50 p-4">
      <div
        aria-hidden="true"
        className={`absolute inset-x-4 -top-px h-px bg-gradient-to-r ${a.bar}`}
      />
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${a.chip}`}>
          {icon}
        </span>
        {heading}
      </h3>
      <ul className="space-y-1.5 text-sm text-fg-muted">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${a.bullet}`} />
            <span className="leading-relaxed">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
