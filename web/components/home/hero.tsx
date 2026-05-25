import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Landing-page hero. Composes a layered mesh-gradient backdrop with
 * three decorative orbs, an animated grid surface, and the canonical
 * trust-pill / headline / CTA stack. Pure server component — all the
 * animation is CSS-driven so we don't ship JS for the marquee or the
 * orb float.
 *
 * The orbs are absolutely positioned on a shared isolating root so
 * their `mix-blend-mode: screen` paints against the hero only and
 * never leaks into the surrounding layout (which would tint the page
 * background on Safari).
 */
export async function HomeHero() {
  const t = await getTranslations("home");

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden rounded-3xl border border-border bg-bg-card"
    >
      {/* Mesh gradient base */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-mesh-1 opacity-90 animate-mesh-shift"
        style={{ animationDuration: "22s" }}
      />
      {/* Subtle grid texture sitting on top of the mesh */}
      <div aria-hidden="true" className="absolute inset-0 grid-bg opacity-70" />

      {/* Three floating orbs — sized to draw the eye toward the centre
          without crowding the headline. */}
      <div aria-hidden="true" className="orb h-72 w-72 -top-24 -left-16 bg-brand animate-orb" />
      <div
        aria-hidden="true"
        className="orb h-80 w-80 top-20 right-0 bg-violet-brand animate-orb"
        style={{ animationDelay: "-7s" }}
      />
      <div
        aria-hidden="true"
        className="orb h-72 w-72 -bottom-20 left-1/3 bg-cyan-brand animate-orb"
        style={{ animationDelay: "-12s" }}
      />

      {/* Soft bottom fade so the hero blends into the page below
          without a hard edge. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-bg/80"
      />

      <div className="relative z-10 px-6 py-20 text-center sm:py-24 md:py-28 lg:py-32">
        <div className="mx-auto flex max-w-3xl flex-col items-center stagger">
          {/* Trust pill */}
          <div className="pill animate-fade-in-up">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping-slow preserve-motion" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="font-medium text-fg">{t("badge")}</span>
            <span className="hidden h-3 w-px bg-border sm:inline-block" />
            <span className="hidden items-center gap-1 text-fg-subtle sm:inline-flex">
              <Sparkles className="h-3 w-3 text-brand" aria-hidden="true" />
              {t("hero_tag")}
            </span>
          </div>

          {/* Headline */}
          <h1
            id="hero-title"
            className="mt-7 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
          >
            <span className="text-gradient-cool">{t("title_1")}</span>{" "}
            <span className="text-gradient-brand">{t("title_2")}</span>
          </h1>

          {/* Sub */}
          <p className="mt-5 max-w-2xl text-balance text-base text-fg-muted sm:mt-6 sm:text-lg md:text-xl">
            {t("subtitle")}
          </p>

          {/* CTAs */}
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/port-checker"
              className="btn-primary shine-on-hover group min-w-[12rem] text-base"
            >
              {t("cta_tools")}
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 transition group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href="/dashboard"
              className="btn-ghost min-h-[44px] min-w-[12rem] text-base"
            >
              {t("cta_dashboard")}
            </Link>
          </div>

          {/* Trust strip — three quick truth-tellers about the product */}
          <dl className="mt-12 grid w-full max-w-2xl grid-cols-3 gap-4 sm:gap-6">
            <Stat value="25+" label={t("stat_tools")} />
            <Stat value="11" label={t("stat_langs")} accent="cyan" />
            <Stat value="0€" label={t("stat_price")} accent="violet" />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  accent = "brand",
}: {
  value: string;
  label: string;
  accent?: "brand" | "cyan" | "violet";
}) {
  const color =
    accent === "cyan"
      ? "text-cyan-soft"
      : accent === "violet"
        ? "text-violet-soft"
        : "text-brand";
  return (
    <div className="rounded-xl border border-border/70 bg-bg-elevated/60 px-3 py-3 text-center backdrop-blur sm:px-4 sm:py-4">
      <dt className={`font-mono text-2xl font-semibold ${color} sm:text-3xl`}>
        {value}
      </dt>
      <dd className="mt-1 text-[11px] uppercase tracking-wider text-fg-subtle sm:text-xs">
        {label}
      </dd>
    </div>
  );
}
