package io.netscope.common.http;

/**
 * Normalises user-supplied URL inputs.
 *
 * Several controllers accept a "url" parameter that can be a bare host
 * ("example.com"), a scheme-relative path, or a full URL. The previous
 * pattern was:
 *
 *   if (!url.startsWith("http")) url = "https://" + url;
 *
 * which has two bugs:
 *
 *   1. "http" matches the bare 4-character string itself ("http",
 *      "httpfoo://...", "httphijack"). These pass through unchanged
 *      and reach URI.create() / HttpClient with no usable scheme.
 *   2. "httpfoo://" is technically a valid URI scheme syntactically,
 *      so it doesn't error at URI.create() — it reaches the fetcher
 *      and produces an opaque connection failure.
 *
 * This helper requires either of the two real schemes; anything else
 * is treated as a bare host that needs prepending. Centralised so a
 * future tightening (e.g. only allow "https://") can be made in one
 * place.
 */
public final class HttpUrlNormaliser {
    private HttpUrlNormaliser() {}

    /**
     * Return {@code url} unchanged if it already starts with "http://"
     * or "https://" (case-insensitive). Otherwise prepend "https://".
     * Empty / null input returns the input as-is — callers should
     * reject those upstream with their own 400.
     */
    public static String ensureHttpScheme(String url) {
        if (url == null || url.isEmpty()) return url;
        String lower = url.toLowerCase();
        if (lower.startsWith("http://") || lower.startsWith("https://")) return url;
        return "https://" + url;
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
