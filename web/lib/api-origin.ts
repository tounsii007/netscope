/**
 * F-RD5-01: Strict validation of NEXT_PUBLIC_API_URL before injecting it
 * into the CSP `connect-src` directive.
 *
 * Previously both {@link ../next.config.ts} (static CSP, build-time) and
 * {@link ./csp.ts} (per-request dynamic CSP, Edge runtime) concatenated
 * `process.env.NEXT_PUBLIC_API_URL` straight into the directive string.
 * A misconfigured value — a trailing slash, an embedded path, a stray
 * `';' script-src 'unsafe-inline" payload, or a non-http scheme — would
 * either silently expand the policy beyond what we intended or
 * outright produce a malformed CSP the browser ignores in full
 * (fail-open: every external script then loads). Validation catches
 * the misconfiguration at build / module-load time instead of at
 * "the browser silently dropped our entire CSP" time.
 *
 * Rules enforced on the value:
 *   • Must parse as a URL.
 *   • Scheme must be `https:` in production, `http:` or `https:` in dev.
 *   • Host must be non-empty.
 *   • MUST NOT carry a path (other than `/`), query, hash, or
 *     userinfo — a CSP source list expects an origin only. Anything
 *     more is either a misconfiguration or a malicious payload trying
 *     to break out of the directive.
 *
 * The returned string is the canonical origin (`scheme://host[:port]`),
 * safe to splice into a CSP directive verbatim.
 *
 * Throws at module load on bad input, which surfaces during
 * `next build` / dev server startup and during Vitest module init —
 * exactly when we want to know.
 */

const DEFAULT_API_URL = "http://localhost:8080";

/**
 * Validate `NEXT_PUBLIC_API_URL` (or the explicit override) and return
 * its canonical origin.  Empty / unset falls back to the dev default.
 *
 * @param raw  Override; defaults to `process.env.NEXT_PUBLIC_API_URL`.
 *             Pass an explicit value in tests so module-load can stay
 *             deterministic.
 */
export function validatedApiOrigin(raw?: string): string {
  const value =
    raw ?? process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `[F-RD5-01] NEXT_PUBLIC_API_URL is not a valid URL: "${value}". ` +
        `Set it to an origin like "https://api.example.com" (no path).`,
    );
  }

  // Scheme guard. Production is https-only; the local dev server runs
  // on http://localhost:8080 so http is permitted when NODE_ENV is not
  // "production".
  const isProd = process.env.NODE_ENV === "production";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !isProd)) {
    throw new Error(
      `[F-RD5-01] NEXT_PUBLIC_API_URL must use https:// (got "${url.protocol}" ` +
        `in "${value}"). http:// is only permitted when NODE_ENV !== production.`,
    );
  }

  if (!url.hostname) {
    throw new Error(
      `[F-RD5-01] NEXT_PUBLIC_API_URL has an empty host: "${value}".`,
    );
  }

  // A CSP source-list entry takes only an origin. Reject everything
  // that would expand the directive past the origin boundary or smuggle
  // additional CSP tokens via the URL surface. `url.pathname === "/"`
  // when the input is a bare origin like `https://api.example.com`;
  // `"/foo"` indicates the user concatenated a path.
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(
      `[F-RD5-01] NEXT_PUBLIC_API_URL must be a bare origin — no path. ` +
        `Got pathname "${url.pathname}" in "${value}".`,
    );
  }
  if (url.search) {
    throw new Error(
      `[F-RD5-01] NEXT_PUBLIC_API_URL must not carry a query string. ` +
        `Got "${url.search}" in "${value}".`,
    );
  }
  if (url.hash) {
    throw new Error(
      `[F-RD5-01] NEXT_PUBLIC_API_URL must not carry a fragment. ` +
        `Got "${url.hash}" in "${value}".`,
    );
  }
  if (url.username || url.password) {
    throw new Error(
      `[F-RD5-01] NEXT_PUBLIC_API_URL must not carry userinfo. ` +
        `Strip "user:pass@" from "${value}".`,
    );
  }

  // `URL#origin` is the canonical scheme://host[:port] form — no
  // trailing slash, no path. Exactly what `connect-src` expects.
  return url.origin;
}
