import Link from "next/link";

/**
 * Decorative hero block for the 404 page: brand badge, gradient "404"
 * glyph, divider, title and description. Pure presentation — no state,
 * no async work, fully server-renderable.
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
        className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-fg-muted hover:text-fg transition"
      >
        {/*
          eslint-disable-next-line @next/next/no-img-element

          404 hero is below-the-fold by definition (the visitor only
          sees it after a routing miss). `loading="lazy"` + async
          decoding keeps it out of the initial paint critical path.
        */}
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
        Traceronix
      </Link>

      <div
        className="select-none font-black leading-none tracking-tighter"
        style={{
          fontSize: "clamp(5rem, 18vw, 12rem)",
          background:
            "linear-gradient(160deg, #f97316 0%, #fb923c 40%, #fdba74 70%, #f97316 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
        aria-hidden="true"
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

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-md text-sm sm:text-base text-fg-muted">
        {description}
      </p>
    </>
  );
}
