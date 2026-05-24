import { cn } from "@/lib/cn";

/**
 * Lightweight pulsing placeholder used while a tool waits for its
 * first response. Greatly preferred over a centred spinner because:
 *
 *   • Holds the page-height stable so the result card doesn't pop in
 *     and bump the rest of the document
 *   • Hints at the SHAPE of the upcoming content, reducing the
 *     "wait, did anything happen?" anxiety
 *   • Pure CSS — no extra JS, no animation cost beyond the existing
 *     `.animate-pulse` Tailwind utility
 *
 * Compose larger skeletons from these primitives — every tool has its
 * own layout, so we don't try to ship one universal skeleton; instead
 * we expose the smallest building blocks (Skeleton, SkeletonText,
 * SkeletonCard) and let each caller arrange them to mirror its own
 * result layout.
 *
 * `aria-hidden` because the loading state is announced via the
 * parent's `aria-busy` (handled by LoadingButton or the surrounding
 * form). Stacking role="status" on every shimmer block would make
 * screen-readers shout "loading" once per primitive.
 */
export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-bg-elevated/80 ring-1 ring-border/40",
        className,
      )}
    />
  );
}

/**
 * Three faded text-lines of decreasing width — mimics a paragraph
 * placeholder. `last:w-2/3` gives the bottom line a shorter shape so
 * the block doesn't read as a solid rectangle.
 */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * Pre-arranged "card with title + 3 metadata chips + 2-line body"
 * skeleton — covers ~90% of tool result cards (port-checker,
 * dns-lookup, ssl-check). Use `count` to render a list of identical
 * skeletons (e.g. multiple DNS record cards).
 */
export function SkeletonCard({
  className,
  count = 1,
}: {
  className?: string;
  count?: number;
}) {
  return (
    <div aria-hidden="true" className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-bg-card/60 p-4"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <div className="flex gap-1.5">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-3 w-16 rounded-md" />
                <Skeleton className="h-3 w-14 rounded-md" />
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
