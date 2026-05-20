import Link from "next/link";

/**
 * Decorative hero block for the 404 page: brand badge, gradient "404"
 * glyph, divider, title and description. Pure presentation — no state,
 * no async work, fully server-renderable.
 *
 * The glyph itself uses a glowing text-shadow + animated brightness
 * (see `.animate-glow-404` in tailwind.config) so it reads as a neon
 * sign without duplicating the "404" text — that matters for the
 * existing testing-library assertion `getByText("404")` which would
 * fail on two matches.
 */
export function Hero404({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated/70 px-3 py-1 text-xs text-fg-muted backdrop-blur transition hover:border-brand/40 hover:text-fg"
      >
        {/*
          404 hero is below-the-fold by definition (the visitor only
          sees it after a routing miss). `loading="lazy"` + async
          decoding keeps it out of the initial paint critical path.

          The eslint-disable directive MUST sit on its own single-line
          comment below this block — multi-line prose between the
          directive and the <img> gets parsed as part of the rule name.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.png"
          alt=""
          width={14}
          height={14}
          loading="lazy"
          decoding="async"
          className="rounded-sm"
          aria-hidden="true"
        />
        <span className="font-medium text-fg">Traceronix</span>
      </Link>

      <div
        className="select-none font-black leading-none tracking-tighter animate-glow-404 preserve-motion"
        style={{
          fontSize: "clamp(5rem, 18vw, 12rem)",
          background:
            "linear-gradient(160deg, #f97316 0%, #fb923c 40%, #fdba74 70%, #f97316 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          filter:
            "drop-shadow(0 8px 24px rgba(249,115,22,0.25)) drop-shadow(0 0 60px rgba(249,115,22,0.15))",
        }}
      >
        404
      </div>

      <div
        className="mx-auto h-px w-32 my-3"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(249,115,22,0.5), transparent)",
        }}
      />

      <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-md text-sm text-fg-muted sm:text-base">
        {description}
      </p>
    </>
  );
}
