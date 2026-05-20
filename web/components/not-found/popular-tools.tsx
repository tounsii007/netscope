import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Quick-rescue grid of the most-used tools. Rendered at the bottom of
 * the 404 page so users always have a one-tap way out, even if the
 * fuzzy-match suggestion didn't fire.
 *
 * Each tile uses the premium-card gradient hover border so the
 * "rescue" section feels intentional, not like a fallback grid.
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
      <p className="mb-3 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
        <span aria-hidden="true" className="h-px w-6 bg-border" />
        {heading}
        <span aria-hidden="true" className="h-px w-6 bg-border" />
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 stagger">
        {items.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="card-premium group flex items-center justify-between gap-2 !p-3 text-sm text-fg-muted"
            >
              <span className="truncate font-medium text-fg">{p.label}</span>
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-90 group-hover:text-brand"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
