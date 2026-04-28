/**
 * next-intl reads the NEXT_LOCALE cookie before falling back to the
 * Accept-Language header. Setting it on switch makes the choice sticky
 * even when the user's browser language disagrees with what they just
 * picked.
 *
 * Path=/ so every locale-prefixed route shares the same cookie;
 * one-year max-age; SameSite=Lax matches Next.js default cookie policy.
 */
export function setLocaleCookie(locale: string) {
  if (typeof document === "undefined") return;
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${
    60 * 60 * 24 * 365
  }; SameSite=Lax`;
}
