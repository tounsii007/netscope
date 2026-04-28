/**
 * One of the three columns in the tool explainer card (How it works /
 * When to use / Limits). Pure presentation: takes a heading + icon +
 * pre-split bullets and renders them as a small visual list.
 */
export function ExplainerColumn({
  icon,
  heading,
  bullets,
}: {
  icon: React.ReactNode;
  heading: string;
  bullets: string[];
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {heading}
      </h3>
      <ul className="space-y-1.5 text-sm text-fg-muted">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
