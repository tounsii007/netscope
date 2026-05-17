import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    // contentinfo landmark is the role <footer> already exposes via
    // the HTML5 sectioning algorithm; an aria-label keeps it
    // distinguishable when a future page adds a second <footer>
    // (e.g. a docs page with a per-article footer block).
    <footer aria-label={t("aria_label")} className="mt-16 border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl 2xl:max-w-7xl flex-col gap-2 px-3 sm:px-4 md:px-6 py-6 sm:py-8 text-sm text-fg-muted md:flex-row md:items-center md:justify-between">
        <p>{t("copyright", { year: new Date().getFullYear() })} {t("tagline")}</p>
        <nav aria-label={t("aria_label")} className="flex gap-4">
          <Link href="/status" className="hover:text-fg">{t("status")}</Link>
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
            className="hover:text-fg"
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("security_policy")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
