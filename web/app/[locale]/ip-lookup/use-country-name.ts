import { useMemo } from "react";
import { useLocale } from "next-intl";

/**
 * Resolve a 2-letter country code to its full localised name using the
 * browser's built-in Intl.DisplayNames API — no extra API call, no static
 * lookup table, follows the user's UI language automatically.
 *
 * Falls back to the input code on runtimes that lack DisplayNames support
 * (very old browsers) or for codes the runtime doesn't know about.
 */
export function useCountryName(code?: string): string {
  const locale = useLocale();
  return useMemo(() => {
    if (!code) return "";
    try {
      const dn = new Intl.DisplayNames([locale], { type: "region" });
      return dn.of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  }, [code, locale]);
}
