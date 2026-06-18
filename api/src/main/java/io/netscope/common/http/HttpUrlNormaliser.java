package io.netscope.common.http;

import io.netscope.common.errors.ApiException;

import java.util.Set;

/**
 * Normalises user-supplied URL inputs.
 *
 * Several controllers accept a "url" parameter that can be a bare host
 * ("example.com"), a scheme-relative path ("//example.com"), or a full
 * URL. The previous pattern was:
 *
 *   if (!url.startsWith("http")) url = "https://" + url;
 *
 * which had two bugs:
 *
 *   1. "http" matches the bare 4-character string itself ("http",
 *      "httpfoo://...", "httphijack"). These pass through unchanged
 *      and reach URI.create() / HttpClient with no usable scheme.
 *   2. "httpfoo://" is technically a valid URI scheme syntactically,
 *      so it doesn't error at URI.create() — it reaches the fetcher
 *      and produces an opaque connection failure.
 *
 * Rules this helper follows
 * ─────────────────────────
 *   • {@code http://} / {@code https://} (case-insensitive) pass
 *     through unchanged.
 *   • {@code //host/...} (protocol-relative) gets {@code https:}
 *     prepended.
 *   • Any other authority-style scheme ({@code ftp://},
 *     {@code gopher://}, {@code file:///x}, etc — anything containing
 *     {@code ://}) is REJECTED with
 *     {@link ApiException#invalidTarget(String)}. No more
 *     {@code https://ftp://example.com}-style gibberish.
 *   • A small denylist rejects the no-slash pseudo-schemes
 *     ({@code javascript:}, {@code data:}, {@code vbscript:},
 *     {@code file:}, {@code mailto:}, {@code tel:}, {@code jar:})
 *     that could otherwise sneak through as "bare host".
 *   • {@code host:port/path} is RECOGNISED as a bare host — the
 *     colon in 'example.com:8080' is not a scheme indicator.
 *   • Bare hostnames get {@code https://} prepended.
 *   • Surrounding whitespace is trimmed before any of the above.
 */
public final class HttpUrlNormaliser {
    private HttpUrlNormaliser() {}

    /**
     * Pseudo-schemes that don't follow the {@code scheme://...} pattern
     * so the substring check for {@code ://} can't catch them. Each
     * matches case-insensitively at the start of input.
     */
    private static final Set<String> DENYLISTED_PSEUDO_SCHEMES = Set.of(
        "javascript:",
        "data:",
        "vbscript:",
        "file:",
        "mailto:",
        "tel:",
        "sms:",
        "jar:"
    );

    /**
     * Return a normalised, https-prefixed URL. See class javadoc for
     * the rule set. Throws {@link ApiException#invalidTarget} for any
     * non-http(s) scheme so the caller doesn't have to repeat that
     * check before calling the fetcher.
     */
    public static String ensureHttpScheme(String url) {
        if (url == null || url.isEmpty()) return url;

        String trimmed = url.trim();
        if (trimmed.isEmpty()) return trimmed;

        String lower = trimmed.toLowerCase();

        // Already an http(s) URL — pass through with original casing
        // preserved so downstream logs are faithful.
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            return trimmed;
        }

        // Protocol-relative ("//example.com/path") — common in HTML
        // markup pasted from page source. Promote to https.
        if (trimmed.startsWith("//")) {
            return "https:" + trimmed;
        }

        // Any authority-style scheme other than http(s) is rejected.
        // Catches ftp://, gopher://, file:///x, jar:file://..., etc.
        // We use a plain substring scan rather than a regex because
        // bare-host inputs like "example.com:8080" should NOT trigger
        // and a regex that tries to distinguish "scheme:" from
        // "host:port" via lookahead gets brittle fast.
        if (trimmed.contains("://")) {
            throw ApiException.invalidTarget(
                "unsupported URL scheme — only http:// and https:// are accepted");
        }

        // No-slash pseudo-schemes: javascript:alert(1), data:text/html,
        // vbscript:, file:, mailto:, tel:, sms:, jar:. Check explicitly
        // because none of them contain "://" so the previous branch
        // wouldn't fire.
        for (String prefix : DENYLISTED_PSEUDO_SCHEMES) {
            if (lower.startsWith(prefix)) {
                throw ApiException.invalidTarget(
                    "unsupported URL scheme — only http:// and https:// are accepted");
            }
        }

        // Bare hostname (with or without port and path). Prepend https.
        return "https://" + trimmed;
    }

    /**
     * Allowlist check for URL fields we pass straight back to the browser
     * (e.g. og:image, og:url, twitter:image). Only {@code http://} and
     * {@code https://} are accepted; everything else — {@code javascript:},
     * {@code data:}, {@code file:}, scheme-relative {@code //evil.example},
     * etc. — is rejected.
     *
     * <p>F-FE-01: previously OpenGraphController echoed the raw attacker-
     * controlled meta-tag value into the JSON response, which let a page
     * with {@code <meta property="og:image" content="javascript:alert(1)">}
     * smuggle a dangerous URL into any client that rendered it into an
     * {@code <img src>} (or worse, an {@code href}) without re-checking.
     *
     * <p>Whitespace is trimmed; null / empty / scheme-relative / opaque
     * inputs all return {@code false}.
     */
    public static boolean isHttpUrl(String url) {
        if (url == null) return false;
        String trimmed = url.trim();
        if (trimmed.isEmpty()) return false;
        // Reject scheme-relative ("//evil.example/x") — without an
        // explicit scheme the browser inherits the parent page's, which
        // means our JSON response can't safely commit to either http or
        // https on the client's behalf.
        if (trimmed.startsWith("//")) return false;
        try {
            java.net.URI uri = java.net.URI.create(trimmed);
            String scheme = uri.getScheme();
            if (scheme == null) return false;
            scheme = scheme.toLowerCase();
            return scheme.equals("http") || scheme.equals("https");
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
