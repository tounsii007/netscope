package io.netscope.ctlogs;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Builds the crt.sh search URL for a given domain. Two SQL LIKE shapes:
 *
 *   • Apex-only:           {@code q=example.com}
 *   • Apex + subdomains:   {@code q=%.example.com}
 *
 * The percent sign is the SQL wildcard. URLEncoder.encode then escapes
 * it to {@code %25} for the HTTP wire — encoding once is essential. A
 * previous version pre-baked {@code %25.} into the query string, which
 * URLEncoder then double-encoded to {@code %2525} and reached crt.sh as
 * a literal "{percent}25" — silently breaking subdomain search.
 */
public final class CtLogQuery {
    private CtLogQuery() {}

    /** Base URL of crt.sh JSON endpoint. Public so tests can confirm. */
    public static final String BASE = "https://crt.sh/";

    public static String build(String domain, boolean includeSubdomains) {
        String pattern = includeSubdomains ? "%." + domain : domain;
        String encoded = URLEncoder.encode(pattern, StandardCharsets.UTF_8);
        return BASE + "?q=" + encoded + "&output=json";
    }
}
