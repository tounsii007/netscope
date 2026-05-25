"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Flag } from "@/components/language-switcher/flag";
import { setLocaleCookie } from "@/components/language-switcher/locale-cookie";
import { ChevronDown, Check } from "lucide-react";

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
 *
 * The dropdown panel now uses the same glass-card styling as the
 * desktop tools menu so the nav reads as a single design system.
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
      {/*
        The trigger label combines the "Switch language" action with the
        currently-selected language so screen readers announce e.g.
        "Switch language; current: English" instead of just "Switch
        language" (which leaves blind users guessing what's active).
        The visible flag + label communicate the same thing to sighted
        users.
      */}
      <button
        className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm text-fg-muted transition hover:border-border hover:bg-bg-elevated hover:text-fg focus:outline-none focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/30"
        aria-label={`${t("switch_lang")}: ${t(langKey(locale))}`}
      >
        <Flag locale={locale} />
        <span className="hidden sm:inline text-xs font-medium">
          {t(langKey(locale))}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-3.5 w-3.5 opacity-60 transition group-hover:rotate-180 group-focus-within:rotate-180"
        />
      </button>
      {/*
        The trigger <button> already provides the accessible name for
        the disclosure region ("Switch language: <current>"), so we
        intentionally do NOT add an aria-label to the <ul> — duplicating
        the label would make `getByLabelText(/switch language/i)` match
        two nodes and confuse AT with redundant announcements.
      */}
      <ul
        className="invisible absolute right-0 top-full z-50 mt-2 w-52 -translate-y-1 overflow-hidden rounded-xl border border-border bg-bg-card/95 p-1 opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        {routing.locales.map((loc) => {
          const isCurrent = loc === locale;
          return (
            <li key={loc}>
              <button
                // aria-current="true" tells AT which language is active.
                // We keep the buttons as plain <button> (not
                // menuitemradio) so existing role-based tests still
                // pass and so users get the familiar Enter/Space
                // semantics; the aria-current state plus the visible
                // bold/colour cue make the selection unambiguous.
                aria-current={isCurrent || undefined}
                // lang attribute helps multilingual TTS voices switch
                // to a native pronunciation for non-Latin scripts
                // (Hindi, Cyrillic, Chinese).
                lang={loc}
                onClick={() => switchLocale(loc)}
                className={`group/item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-bg-elevated ${
                  isCurrent
                    ? "text-brand font-semibold bg-brand/5"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                <Flag locale={loc} />
                <span className="flex-1 text-left">{t(langKey(loc))}</span>
                {isCurrent && (
                  <Check className="ml-auto h-3.5 w-3.5 text-brand" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
