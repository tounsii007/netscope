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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.png"
        alt="Traceronix"
        width={32}
        height={32}
        className="h-8 w-8 rounded-xl shrink-0"
      />
      <span className="hidden md:inline text-base tracking-tight">
        Traceronix
      </span>
    </Link>
  );
}
