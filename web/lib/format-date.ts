"use client";

import { useLocale } from "next-intl";

/**
 * Locale-aware date / time formatting via `Intl.DateTimeFormat` +
 * `Intl.RelativeTimeFormat`. Two surfaces:
 *
 *   • {@link useFormatDate} — client-component hook; resolves the
 *     active locale via next-intl and exposes `short / full /
 *     relative` formatter methods.
 *   • {@link formatDate} — server-component / utility variant; pass
 *     the locale explicitly.
 *
 * Why a single helper instead of ad-hoc calls at every site:
 *   - `new Date(x).toLocaleDateString()` without a locale arg uses
 *     the browser default, which differs between users (German user
 *     sees "31.5.2026", US user sees "5/31/2026"). The helper pins
 *     formatting to the SAME locale as the rest of the UI.
 *   - `toISOString()` rendered into the UI ("2026-05-31T15:37:30Z")
 *     is operator-grade, not user-grade. Replace with `short()`.
 *   - "3 hours ago" requires `Intl.RelativeTimeFormat`; rolling our
 *     own would mistranslate plurals across locales (e.g. Polish has
 *     three plural forms; Russian four).
 *   - Time-zone display: `full` always shows the resolved short
 *     name (e.g. "GMT+2", "PST") so users can tell whether the
 *     value is in their TZ or the server's UTC.
 */
export function useFormatDate() {
  const locale = useLocale();
  return {
    /** Long absolute date — "May 31, 2026" / "31. Mai 2026" / "31 мая 2026 г.". */
    short: (input: Date | string | number) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(input)),

    /** Long date + short time + short time-zone name —
     *  "May 31, 2026, 5:37 PM UTC". */
    full: (input: Date | string | number) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeStyle: "short",
        timeZoneName: "short",
      }).format(new Date(input)),

    /** Short time-only — "5:37 PM" / "17:37". Use when the date is
     *  obvious from context (e.g. event log row whose row header
     *  already shows the day). */
    timeOnly: (input: Date | string | number) =>
      new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(input)),

    /** Relative — "3 hours ago" / "vor 3 Stunden" / "через 5 минут".
     *  Accepts past or future timestamps; the sign on the delta
     *  picks the right tense automatically. */
    relative: (input: Date | string | number, now: number) => {
      const target = new Date(input).getTime();
      const seconds = Math.round((target - now) / 1000);
      const abs = Math.abs(seconds);
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      if (abs < 60) return rtf.format(seconds, "second");
      if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
      if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
      if (abs < 30 * 86_400) return rtf.format(Math.round(seconds / 86_400), "day");
      if (abs < 365 * 86_400) return rtf.format(Math.round(seconds / (30 * 86_400)), "month");
      return rtf.format(Math.round(seconds / (365 * 86_400)), "year");
    },
  };
}

/** Server-component-compatible variant. The locale must be passed
 *  explicitly because hooks aren't available outside client components.
 *  Use this from `app/[locale]/page.tsx` server components and pass the
 *  `locale` segment param through. */
export function formatDate(
  locale: string,
  input: Date | string | number,
  style: "short" | "full" | "timeOnly" = "short",
): string {
  const opts: Intl.DateTimeFormatOptions =
    style === "full"
      ? { dateStyle: "long", timeStyle: "short", timeZoneName: "short" }
      : style === "timeOnly"
        ? { timeStyle: "short" }
        : { dateStyle: "long" };
  return new Intl.DateTimeFormat(locale, opts).format(new Date(input));
}

/**
 * React hook for a re-rendering clock. Returns Date.now() as state
 * that updates every {@code intervalMs} (default 30 s). Use to drive
 * relative-time displays that need to tick forward without each
 * component duplicating the setInterval boilerplate, AND to avoid
 * the "Date.now() during render" anti-pattern lint rule.
 */
import { useEffect, useState } from "react";
export function useNow(intervalMs: number = 30_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
