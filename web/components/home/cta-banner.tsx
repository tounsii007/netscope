import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Terminal } from "lucide-react";

/**
 * Bottom-of-page CTA. Mirrors the hero's mesh-gradient feel but with
 * a tighter footprint — meant to catch users who scrolled past every
 * tool and are ready to act.
 */
export async function CtaBanner() {
  const t = await getTranslations("home.cta");

  return (
    <section
      aria-labelledby="cta-title"
      className="relative isolate mt-4 overflow-hidden rounded-3xl border border-border bg-bg-card"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-mesh-2 opacity-90" />
      <div aria-hidden="true" className="absolute inset-0 grid-bg opacity-60" />
      <div aria-hidden="true" className="orb h-56 w-56 -top-10 -left-10 bg-brand opacity-50" />
      <div aria-hidden="true" className="orb h-56 w-56 -bottom-10 -right-10 bg-cyan-brand opacity-50" />

      <div className="relative z-10 flex flex-col items-start gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-14">
        <div className="max-w-xl">
          <span className="badge-info">
            <Terminal className="h-3 w-3" aria-hidden="true" />
            {t("eyebrow")}
          </span>
          <h2
            id="cta-title"
            className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-2 text-sm text-fg-muted sm:text-base">{t("subtitle")}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="btn-primary shine-on-hover group min-w-[10rem]"
          >
            {t("primary")}
            <ArrowRight
              className="h-4 w-4 transition group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
          <Link href="/status" className="btn-ghost min-w-[10rem]">
            {t("secondary")}
          </Link>
        </div>
      </div>
    </section>
  );
}
