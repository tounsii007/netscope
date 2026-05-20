import Link from "next/link";

/**
 * Brand mark on the left of the nav: app icon + product name.
 *
 * The text only appears at `md:` and up so the icon never gets pushed
 * off-screen on tablets when the category dropdowns expand.
 *
 * Hover effect: a soft brand-coloured halo behind the icon and a
 * shine sweep across the wordmark. Both are pure CSS so we don't ship
 * a client component just for the brand link.
 */
export function BrandLink() {
  return (
    <Link
      href="/"
      className="group relative flex items-center gap-2.5 font-semibold shrink-0 whitespace-nowrap rounded-lg px-1 py-1 -mx-1 -my-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <span className="relative inline-flex">
        {/* Brand-coloured halo that lights up on hover. Sits behind
            the icon via `inset-0` + negative z; opacity-driven so it
            doesn't reflow surrounding text on toggle. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-xl bg-brand/30 opacity-0 blur-md transition group-hover:opacity-100"
        />
        {/*
          We hint the brand mark at `fetchPriority="high"` because it
          renders inside the sticky header (above the fold) and is
          always part of the visible LCP candidate set. Next.js doesn't
          infer this for static <img> tags so we annotate explicitly.
          `decoding="async"` lets the GPU decode in parallel with the
          rest of the paint instead of blocking on the main thread.

          The eslint-disable directive MUST stay on its own single-line
          comment immediately before <img>: ESLint reads the next line
          after the directive and any multi-line prose between would be
          interpreted as part of the rule name. See PR #26 CI failure.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.png"
          alt="Traceronix"
          width={32}
          height={32}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="h-8 w-8 rounded-xl shrink-0 ring-1 ring-border/70 transition group-hover:ring-brand/50"
        />
      </span>
      <span className="hidden md:inline text-base tracking-tight text-fg">
        Traceronix
      </span>
    </Link>
  );
}
