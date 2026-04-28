/**
 * Normalise user-provided host input into a bare hostname.
 *
 * Real-world input that should all collapse to "example.com":
 *
 *   • "  example.com  "                       (whitespace)
 *   • "https://example.com"                   (scheme)
 *   • "https://example.com/foo/bar"           (scheme + path)
 *   • "https://example.com:8080/x?q=1#h"      (scheme + port + query + hash)
 *   • "https://user:pass@example.com/"        (scheme + userinfo)
 *   • "EXAMPLE.com"                           (case)
 *   • "example.com."                          (trailing dot)
 *
 * Returns the empty string if the input is unsalvageable; callers should
 * treat that as "invalid input, do not call the API".
 *
 * Why not `new URL(input).hostname`?
 * The URL constructor throws on inputs without a scheme (e.g. plain
 * "example.com"), which is the most common case. We try URL() first for
 * full URLs and fall back to manual stripping for bare hostnames.
 */
export function normaliseHost(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  if (!s) return "";

  // If the user typed a scheme, let URL parse it — handles userinfo, port,
  // path, query and fragment in one go.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      s = u.hostname;
    } catch {
      // Fall through to manual stripping below.
    }
  }

  // Manual stripping for inputs WITHOUT a scheme.
  // Drop everything after the first '/', '?' or '#'.
  s = s.split(/[/?#]/)[0];
  // Drop port suffix (":8080").
  const colonIdx = s.indexOf(":");
  if (colonIdx > 0) s = s.slice(0, colonIdx);
  // Drop userinfo prefix ("user@").
  const atIdx = s.indexOf("@");
  if (atIdx >= 0) s = s.slice(atIdx + 1);
  // Drop trailing dot (FQDN canonical form).
  if (s.endsWith(".")) s = s.slice(0, -1);

  return s.toLowerCase();
}

/**
 * Normalise input for tools that operate on the *registered* domain rather
 * than a specific hostname — Subdomain Finder being the prime example. crt.sh
 * / CertSpotter index by the suffix, so querying "www.example.com" returns
 * only certs that include "www.example.com" literally (typically just one),
 * while querying "example.com" returns the full set.
 *
 * On top of {@link normaliseHost}'s scheme/path/port stripping this also:
 *   • drops a single leading "www." (the most common false-precision)
 *
 * Multiple-leading subdomains ("api.staging.example.com") are kept as-is —
 * the user is presumed to want that specific subtree's certs.
 */
export function normaliseRegistrableDomain(raw: string): string {
  let s = normaliseHost(raw);
  if (s.startsWith("www.")) s = s.slice(4);
  return s;
}

/**
 * Same as {@link normaliseHost} but keeps the protocol and path — useful for
 * tools that legitimately want the full URL (HTTP Headers, Redirects,
 * OpenGraph, Mixed Content). We just trim and add a default scheme if the
 * user typed "example.com" without one.
 */
export function normaliseUrl(raw: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (!s) return "";
  // Already has a scheme? Trust it.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  // Bare hostname or hostname-with-path → assume HTTPS.
  return "https://" + s;
}
