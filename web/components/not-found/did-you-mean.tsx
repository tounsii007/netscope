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
    <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-bg-elevated/60 px-3 py-1.5 text-xs">
      <SearchX className="h-3.5 w-3.5 shrink-0 text-warn" />
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
      className="group mt-5 inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/5 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10 transition"
    >
      <Lightbulb className="h-4 w-4" />
      <span>
        {prefix} <span className="font-semibold">{label}</span>
        <span className="ml-1 font-mono text-xs opacity-60">({href})</span>
      </span>
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
