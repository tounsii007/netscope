import Link from "next/link";

/**
 * Brand mark on the left of the nav: app icon + product name.
 * The text only appears at `md:` and up so the icon never gets pushed
 * off-screen on tablets when the category dropdowns expand.
 */
export function BrandLink() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 font-semibold shrink-0 whitespace-nowrap"
    >
      {/*
        eslint-disable-next-line @next/next/no-img-element

        We hint the brand mark at `fetchPriority="high"` because it
        renders inside the sticky header (above the fold) and is
        always part of the visible LCP candidate set. Next.js doesn't
        infer this for static <img> tags so we annotate explicitly.
        `decoding="async"` lets the GPU decode in parallel with the
        rest of the paint instead of blocking on the main thread.
      */}
      <img
        src="/icon.png"
        alt="Traceronix"
        width={32}
        height={32}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="h-8 w-8 rounded-xl shrink-0"
      />
      <span className="hidden md:inline text-base tracking-tight">
        Traceronix
      </span>
    </Link>
  );
}
