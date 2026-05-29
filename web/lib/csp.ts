/**
 * Per-request CSP nonce generator + CSP-with-nonce builder.
 *
 * Used from {@link middleware.ts}. A fresh nonce is generated for every
 * request handled by the matcher, surfaced to the rendered layout via
 * the `x-nonce` request header, and embedded into the response's
 * Content-Security-Policy header so the browser only executes scripts
 * that carry the matching `nonce=` attribute.
 *
 * Threat model: drops `'unsafe-inline'` from script-src and style-src
 * for HTML responses, which removes the largest reflected/stored-XSS
 * blast-radius lever the existing CSP still allowed. Static-asset
 * responses (CSS, JS bundles, images) bypass the middleware matcher
 * entirely and continue to ship the pre-existing CSP from
 * next.config.ts — that path doesn't render user input, so the
 * `unsafe-inline` allowance there is benign.
 *
 * Notes
 *   • `crypto.randomUUID()` returns 122 bits of entropy, base64-encoded
 *     to 22 chars. CSP nonces need ≥128 bits per the spec; we generate
 *     16 random bytes via `crypto.getRandomValues` and base64 them
 *     instead, which yields 22 chars and 128 bits.
 *   • `connect-src` keeps the API and HIBP host; the values mirror the
 *     static CSP. If you add a new third-party fetch destination, add
 *     it in BOTH this file and next.config.ts so static and dynamic
 *     responses agree.
 */

/** Generate a cryptographically strong base64 nonce (128 bits). */
export function generateNonce(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  // base64 → 24 chars incl. "==" padding. Drop the padding so the value
  // is URL-/header-safe without escaping; the CSP parser accepts it.
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "");
}

/**
 * Build the CSP for a single request, using `nonce-<value>` instead of
 * `'unsafe-inline'` for script-src and style-src.
 *
 * The directive list mirrors {@code next.config.ts}'s static CSP except
 * for the two `'unsafe-inline'` entries, which become `'nonce-…'`. Keep
 * the two in sync — divergence shows up as a hard-to-debug "works on
 * static routes, breaks on dynamic" production bug.
 */
export function buildCspWithNonce(nonce: string): string {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const n = `'nonce-${nonce}'`;
  // Dev mode: Next.js's HMR runtime injects inline <script> tags that
  // don't carry our nonce, and the React dev tools eval-load further
  // helpers. Allowing 'unsafe-inline' + 'unsafe-eval' in dev keeps the
  // page usable; the production build of Next.js does NOT inject
  // un-nonce'd scripts, so the strict policy applies in prod.
  // NODE_ENV is wired by Next at build-time, not runtime, so the
  // dead-code-eliminated build will literally not contain the dev
  // allowances.
  const isDev = process.env.NODE_ENV !== "production";
  const scriptExtras = isDev ? " 'unsafe-inline' 'unsafe-eval'" : " 'strict-dynamic'";
  const styleExtras  = isDev ? " 'unsafe-inline'" : "";
  return [
    "default-src 'self'",
    // strict-dynamic (prod) lets any script the nonce'd bootstrap
    // injects (Next.js hydration runtime, route chunks) execute
    // without each chunk needing its own nonce attribute.
    `script-src 'self' ${n}${scriptExtras}`,
    // style-src nonce works for any <style nonce={n}> we render
    // ourselves; Tailwind ships as a hashed static stylesheet under
    // 'self' so it's covered without an additional source.
    `style-src 'self' ${n}${styleExtras} fonts.googleapis.com`,
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' data: blob: *.openstreetmap.org *.cartocdn.com tile.openstreetmap.org basemaps.cartocdn.com flagcdn.com",
    `connect-src 'self' ${apiOrigin} api.pwnedpasswords.com`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
    "report-uri /api/csp-report",
    "report-to csp-endpoint",
  ].join("; ");
}
