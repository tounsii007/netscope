import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Compass, Home } from "lucide-react";
import { TOOL_LINKS } from "@/components/site-nav";
import { Hero404 } from "@/components/not-found/hero-404";
import { PathBadge, DidYouMean } from "@/components/not-found/did-you-mean";
import { PopularTools } from "@/components/not-found/popular-tools";
import { readRequestedPath } from "@/lib/not-found/read-requested-path";
import { suggestTool } from "@/lib/not-found/suggest-tool";

/**
 * Dynamic, localised 404 page.
 *
 * Why this lives in `[locale]/not-found.tsx` instead of `app/not-found.tsx`:
 * the locale layout is the closest enclosing layout for unmatched paths
 * underneath `/{locale}/...`, so Next.js renders this file when no route
 * inside the locale segment matches. Translations resolve against the
 * active locale automatically.
 *
 * Composed of focused pieces:
 *   • Hero404      — branded gradient 404 + title + description
 *   • PathBadge    — echoes the URL the user typed
 *   • DidYouMean   — Levenshtein-based "did you mean…?" suggestion
 *   • PopularTools — bottom-of-page rescue grid
 *
 * The Levenshtein helper and path reader live in lib/ so other tools
 * can reuse them.
 */
const POPULAR_SLUGS = [
  "port-checker",
  "ip-lookup",
  "dns-lookup",
  "ssl-check",
  "whois",
  "subdomains",
];

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "not_found" });
  const tNav = await getTranslations({ locale, namespace: "nav.tools" });

  const path = await readRequestedPath();
  const lastSegment =
    path.split("?")[0].split("/").filter(Boolean).pop() ?? "";
  const suggestion = suggestTool(lastSegment);

  const popular = POPULAR_SLUGS.map((slug) => {
    const link = TOOL_LINKS.find((l) => l.href === `/${slug}`);
    return link ? { href: link.href, label: tNav(link.key) } : null;
  }).filter((x): x is { href: string; label: string } => x !== null);

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Soft ambient glow + subtle grid behind the content */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[400px] w-[400px] rounded-full bg-brand/10 blur-[120px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-0 grid-bg opacity-40" />

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center">
        <Hero404 title={t("title")} description={t("desc")} />

        <PathBadge path={path} />

        {suggestion && (
          <DidYouMean
            href={suggestion.href}
            label={tNav(suggestion.key)}
            prefix={t("did_you_mean")}
          />
        )}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Link href="/" className="btn gap-2">
            <Home className="h-4 w-4" />
            {t("back")}
          </Link>
          <Link href="/port-checker" className="btn-ghost gap-2">
            <Compass className="h-4 w-4" />
            {t("explore_tools")}
          </Link>
        </div>

        <PopularTools heading={t("popular_tools")} items={popular} />

        <p className="mt-10 text-xs text-fg-subtle/70">{t("hint")}</p>
      </div>
    </div>
  );
}
