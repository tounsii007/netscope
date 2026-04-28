import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Quick-rescue grid of the most-used tools. Rendered at the bottom of
 * the 404 page so users always have a one-tap way out, even if the
 * fuzzy-match suggestion didn't fire.
 */
export function PopularTools({
  heading,
  items,
}: {
  heading: string;
  items: { href: string; label: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-12 w-full">
      <p className="mb-3 text-xs uppercase tracking-wider text-fg-subtle">
        {heading}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-card/60 px-3 py-2 text-sm text-fg-muted transition hover:border-brand/40 hover:bg-bg-elevated hover:text-fg"
            >
              <span className="truncate">{p.label}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
