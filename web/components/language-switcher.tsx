"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Flag } from "@/components/language-switcher/flag";
import { setLocaleCookie } from "@/components/language-switcher/locale-cookie";

/**
 * Language picker dropdown. Hover / focus reveals the full list of
 * locales with flag + native name. Switching:
 *   1. strips the current locale prefix from the path
 *   2. sets NEXT_LOCALE cookie so the choice survives reloads
 *   3. pushes to the new locale-prefixed path (or `/` for the default)
 *   4. router.refresh() so next-intl re-reads messages immediately
 *
 * Flag rendering and cookie helper live in their own files so any other
 * locale UI (settings page, footer picker) can reuse them.
 */
type LangKey =
  | "lang_en" | "lang_de" | "lang_fr" | "lang_es" | "lang_it"
  | "lang_pl" | "lang_ru" | "lang_uk" | "lang_tr" | "lang_hi" | "lang_zh";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();

  const langKey = (loc: string) => `lang_${loc}` as LangKey;

  function switchLocale(next: string) {
    const locales = routing.locales as readonly string[];
    let path = pathname;
    for (const loc of locales) {
      if (path.startsWith(`/${loc}/`)) {
        path = path.slice(loc.length + 1);
        break;
      }
      if (path === `/${loc}`) {
        path = "/";
        break;
      }
    }
    setLocaleCookie(next);
    const target = next === routing.defaultLocale ? path : `/${next}${path}`;
    router.push(target);
    router.refresh();
  }

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg transition"
        aria-label={t("switch_lang")}
      >
        <Flag locale={locale} />
        <span className="hidden sm:inline text-xs font-medium">
          {t(langKey(locale))}
        </span>
        <svg
          className="h-3 w-3 opacity-50"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <div className="absolute right-0 top-full z-50 mt-1 hidden w-44 overflow-hidden rounded-lg border border-border bg-bg-card shadow-xl group-focus-within:block group-hover:block">
        {routing.locales.map((loc) => (
          <button
            key={loc}
            onClick={() => switchLocale(loc)}
            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition hover:bg-bg-elevated ${
              loc === locale
                ? "text-brand font-semibold bg-brand/5"
                : "text-fg-muted"
            }`}
          >
            <Flag locale={loc} />
            <span>{t(langKey(loc))}</span>
            {loc === locale && (
              <span className="ml-auto text-xs text-brand">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
