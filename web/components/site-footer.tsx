import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldCheck, Activity, Heart, Sparkles } from "lucide-react";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const year = new Date().getFullYear();

  return (
    // contentinfo landmark is the role <footer> already exposes via
    // the HTML5 sectioning algorithm; an aria-label keeps it
    // distinguishable when a future page adds a second <footer>
    // (e.g. a docs page with a per-article footer block).
    <footer
      aria-label={t("aria_label")}
      className="relative isolate mt-20 overflow-hidden border-t border-border/60"
    >
      {/* Gradient hairline that fades to transparent on both edges,
          plus a soft brand glow at the very bottom centre for a
          "leave on a warm note" finish. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-40 w-[60%] -translate-x-1/2 rounded-full bg-brand/8 blur-[100px]"
      />

      <div className="mx-auto flex w-full max-w-6xl 2xl:max-w-7xl flex-col gap-6 px-3 sm:px-4 md:px-6 py-8 sm:py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          {/* Brand block */}
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon.png"
              alt=""
              width={28}
              height={28}
              loading="lazy"
              decoding="async"
              className="h-7 w-7 rounded-lg ring-1 ring-border"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold tracking-tight text-fg">Traceronix</p>
              <p className="mt-0.5 max-w-xs text-xs text-fg-muted sm:text-sm">
                {t("tagline")}
              </p>
            </div>
          </div>

          {/* Footer links */}
          <nav aria-label={t("aria_label")} className="flex flex-wrap items-center gap-2">
            <Link
              href="/changelog"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-card/50 px-3 py-1.5 text-xs text-fg-muted transition hover:border-brand/40 hover:text-fg"
            >
              <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              {t("changelog")}
            </Link>
            <Link
              href="/status"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-card/50 px-3 py-1.5 text-xs text-fg-muted transition hover:border-success/40 hover:text-fg"
            >
              <Activity className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              {t("status")}
            </Link>
            {/*
              Security policy + researcher contact discoverability:
              • /SECURITY.md is the canonical disclosure policy (90-day
                embargo, scope, safe harbour)
              • /.well-known/security.txt mirrors the contact channel in
                RFC 9116 format for automated scrapers (Burp / OWASP ZAP).
              Linking both from the always-rendered footer means a
              researcher who lands on any page can reach the policy in
              one click without guessing well-known URLs.
            */}
            <a
              href="https://github.com/tounsii007/netscope/blob/main/SECURITY.md"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-card/50 px-3 py-1.5 text-xs text-fg-muted transition hover:border-brand/40 hover:text-fg"
              rel="noopener noreferrer"
              target="_blank"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              {t("security_policy")}
            </a>
          </nav>
        </div>

        {/* Bottom rule */}
        <div className="flex flex-col gap-2 border-t border-border/50 pt-5 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:text-sm">
          <p>
            {t("copyright", { year })}
          </p>
          <p className="inline-flex items-center gap-1.5">
            <span>Made with</span>
            <Heart
              className="h-3.5 w-3.5 text-brand animate-pulse-glow preserve-motion"
              aria-hidden="true"
            />
            <span>for the internet.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
