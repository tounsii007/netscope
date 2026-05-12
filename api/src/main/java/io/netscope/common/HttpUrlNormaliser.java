package io.netscope.common;

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
}
