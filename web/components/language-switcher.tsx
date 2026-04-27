"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { routing } from "@/i18n/routing";

const FLAGS: Record<string, string> = {
  en: "🇺🇸",
  de: "🇩🇪",
  hi: "🇮🇳",
  zh: "🇸🇬",
};

/** next-intl reads this cookie before falling back to Accept-Language. Setting
 *  it here makes the switch sticky even when the user's browser language
 *  disagrees with what they just picked.  Path=/ so every locale-prefixed
 *  route shares the same cookie; one-year max-age. */
function setLocaleCookie(locale: string) {
  if (typeof document === "undefined") return;
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();

  const langKey = (loc: string) => `lang_${loc}` as "lang_en" | "lang_de" | "lang_hi" | "lang_zh";

  function switchLocale(next: string) {
    const locales = routing.locales as readonly string[];
    let path = pathname;
    for (const loc of locales) {
      if (path.startsWith(`/${loc}/`)) { path = path.slice(loc.length + 1); break; }
      if (path === `/${loc}`) { path = "/"; break; }
    }
    // Persist the choice so the middleware doesn't redirect us back to
    // the browser's Accept-Language locale on the next page load.
    setLocaleCookie(next);
    const target = next === routing.defaultLocale ? path : `/${next}${path}`;
    router.push(target);
    // Force a refresh so next-intl re-reads the cookie + re-renders with
    // the new messages bundle. Without this, the visible page can stay on
    // the previous locale until the user navigates somewhere else.
    router.refresh();
  }

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg transition"
        aria-label={t("switch_lang")}
      >
        <span className="text-base leading-none">{FLAGS[locale]}</span>
        <span className="hidden sm:inline text-xs font-medium">{t(langKey(locale))}</span>
        <svg className="h-3 w-3 opacity-50" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      <div className="absolute right-0 top-full z-50 mt-1 hidden w-40 rounded-lg border border-border bg-bg-card shadow-xl group-focus-within:block group-hover:block">
        {routing.locales.map((loc) => (
          <button
            key={loc}
            onClick={() => switchLocale(loc)}
            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition hover:bg-bg-elevated first:rounded-t-lg last:rounded-b-lg ${loc === locale ? "text-brand font-semibold bg-brand/5" : "text-fg-muted"}`}
          >
            <span className="text-base leading-none">{FLAGS[loc]}</span>
            <span>{t(langKey(loc))}</span>
            {loc === locale && <span className="ml-auto text-xs text-brand">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
