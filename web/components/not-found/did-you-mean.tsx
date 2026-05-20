import Link from "next/link";
import { ArrowRight, Lightbulb, SearchX } from "lucide-react";

/**
 * Two small pieces that often render together right under the 404 hero:
 *
 *   • PathBadge — echoes the URL the user typed, so they can see exactly
 *     what 404'd. Helps when the typo is in the hostname-display itself.
 *   • DidYouMean — the fuzzy-match suggestion link. Only renders when
 *     the parent has a hit; we never show "did you mean ipv6?" for
 *     "/totally-unrelated".
 */
export function PathBadge({ path }: { path: string }) {
  if (!path) return null;
  return (
    <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-1.5 text-xs ring-1 ring-warn/20">
      <SearchX className="h-3.5 w-3.5 shrink-0 text-warn" />
      <span className="text-warn/90">Path</span>
      <code className="truncate font-mono text-fg-muted" title={path}>
        {path}
      </code>
    </div>
  );
}

export function DidYouMean({
  label,
  href,
  prefix,
}: {
  label: string;
  href: string;
  prefix: string;
}) {
  return (
    <Link
      href={href}
      className="group shine-on-hover mt-5 inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/5 px-4 py-2.5 text-sm font-medium text-brand transition hover:bg-brand/15 hover:shadow-glow-brand"
    >
      <Lightbulb className="h-4 w-4" aria-hidden="true" />
      <span>
        {prefix} <span className="font-semibold">{label}</span>
        <span className="ml-1 font-mono text-xs opacity-60">({href})</span>
      </span>
      <ArrowRight
        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
