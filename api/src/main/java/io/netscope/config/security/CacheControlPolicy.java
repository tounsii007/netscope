package io.netscope.config.security;

/**
 * Per-path {@code Cache-Control} policy for the API.
 *
 * Errors in classification leak in two directions:
 *   • False idempotent (a mutating endpoint cached) → stale or
 *     cross-user data served by the browser cache.
 *   • False mutating (a hot lookup forced to no-store) → user
 *     experience regression on every re-click.
 *
 * Owning the prefix tables + classification math in its own class
 * keeps {@link io.netscope.config.SecurityConfig} a thin composer of
 * filter-chain configuration, and lets the test suite pin the
 * classification without bringing up Spring.
 *
 * Decision pipeline (precedence top-down):
 *   • non-/api/ path                  → {@code null} (caller skips the header)
 *   • mutating + user-state surface   → {@code "no-store"}
 *   • idempotent lookup surface       → {@code "private, max-age=120, …"}
 *   • everything else under /api/     → {@code "no-store"} (conservative default)
 */
public final class CacheControlPolicy {

    private CacheControlPolicy() {}

    /** Cache-Control value for shareable, idempotent lookup responses. */
    public static final String IDEMPOTENT_LOOKUP_HEADER =
        "private, max-age=120, stale-while-revalidate=300";

    /**
     * Path prefixes that carry per-user state or accept mutations.
     * Anything matching these MUST NOT be cached anywhere — even a 200
     * may include a one-shot token or session-bound payload.
     */
    public static final String[] MUTATING_PREFIXES = {
        "/api/v1/auth/",
        "/api/v1/billing/",
        "/api/v1/monitor",
        "/api/v1/user",
        "/api/v1/users",
        "/api/v1/workspaces",
        "/api/v1/api-keys",
        "/api/v1/webhook",
        // CSP reports land at /api/csp-report on the Next.js frontend
        // (see next.config.ts → "report-uri /api/csp-report"). The
        // backend currently has no /api/v1/csp-report route, but the
        // entry stays here as defense-in-depth: if a future backend
        // consumer is added, an absent classifier would let the CDN
        // cache attacker-supplied report bodies.
        "/api/v1/csp-report",
        "/api/v1/log",
        "/api/v1/vitals",
        "/api/v1/ip/me",     // caller-IP dependent — must not be cached cross-user
        "/api/v1/websocket", // probe RTT is time-sensitive
    };

    /**
     * Path prefixes that are GET-shaped, idempotent, and identical
     * across callers for a given input. Eligible for short-term private
     * (browser-only) caching to make tab re-clicks instant.
     */
    public static final String[] IDEMPOTENT_LOOKUP_PREFIXES = {
        "/api/v1/dns/",
        "/api/v1/dns-propagation/",
        "/api/v1/dnssec/",
        "/api/v1/doh/",
        "/api/v1/dkim/",
        "/api/v1/ip/",         // /ip/{ip} — NOT /ip/me (caught by mutating list above)
        "/api/v1/ssl/",
        "/api/v1/ssl-grade/",
        "/api/v1/ct-logs/",
        "/api/v1/whois/",
        "/api/v1/subdomains/",
        "/api/v1/cdn/",
        "/api/v1/tech/",
        "/api/v1/blacklist/",
        "/api/v1/bgp/",
        "/api/v1/ipv6/",
        "/api/v1/headers",
        "/api/v1/redirect",
        "/api/v1/cookies",
        "/api/v1/opengraph",
        "/api/v1/robots/",
        "/api/v1/mixed-content",
        "/api/v1/email-auth/",
    };

    public static boolean isMutatingOrUserState(String path) {
        for (String p : MUTATING_PREFIXES) {
            if (path.startsWith(p)) return true;
        }
        return false;
    }

    public static boolean isIdempotentLookup(String path) {
        // /ip/me hits the mutating list ABOVE first; this only matches
        // /ip/{ip-literal} lookups. Same precedence in the caller.
        for (String p : IDEMPOTENT_LOOKUP_PREFIXES) {
            if (path.startsWith(p)) return true;
        }
        return false;
    }

    /**
     * Decide the {@code Cache-Control} value for an API request path.
     * Returns {@code null} for non-/api/ paths so the caller knows to
     * skip the header entirely (avoids tanking CDN hit-rate on hashed
     * static assets that go through their own long-cache policy).
     */
    public static String resolveCacheControl(String path) {
        if (path == null || !path.startsWith("/api/")) return null;
        if (isMutatingOrUserState(path)) return "no-store";
        if (isIdempotentLookup(path)) return IDEMPOTENT_LOOKUP_HEADER;
        return "no-store";
    }
}
