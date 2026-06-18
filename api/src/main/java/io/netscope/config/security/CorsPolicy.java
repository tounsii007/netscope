package io.netscope.config.security;

import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * CORS configuration source builder. Hardens against two common
 * misconfigurations:
 *
 *   • Empty/missing {@code netscope.cors.allowed-origins} → fail fast
 *     at boot. Spring's CORS layer would silently default to "any
 *     origin", voiding the entire same-origin policy.
 *   • Wildcard {@code *} in the origin list → fail fast at boot.
 *     A '*' in the whitelist negates the whitelist by accepting every
 *     origin including credential-bearing requests in older browsers.
 *
 * Both checks throw {@link IllegalStateException} — Spring Boot turns
 * that into a refusal to start the application, which is the only safe
 * behaviour for a misconfigured CORS gate.
 */
public final class CorsPolicy {

    private CorsPolicy() {}

    public static CorsConfigurationSource build(String allowedOriginsCsv) {
        List<String> origins = parseOrigins(allowedOriginsCsv);
        if (origins.isEmpty()) {
            throw new IllegalStateException(
                "netscope.cors.allowed-origins must be set to one or more origins; "
                    + "e.g. CORS_ORIGINS=https://app.netscope.io,https://staging.netscope.io");
        }
        if (origins.contains("*")) {
            throw new IllegalStateException(
                "netscope.cors.allowed-origins must not contain '*'; "
                    + "list explicit origins instead.");
        }
        // Fail-fast: every entry must be a real http(s) origin. Catches
        // copy-paste typos like `app.netscope.io` (no scheme) or
        // `https://app.netscope.io/` (trailing slash) BEFORE the proxy
        // serves a single request. Spring's CORS layer would otherwise
        // silently miss the comparison and 403 every legitimate browser.
        for (String o : origins) {
            if (!(o.startsWith("http://") || o.startsWith("https://"))) {
                throw new IllegalStateException(
                    "netscope.cors.allowed-origins entry must start with http:// or https://: " + o);
            }
            if (o.endsWith("/")) {
                throw new IllegalStateException(
                    "netscope.cors.allowed-origins entry must not have a trailing slash: " + o);
            }
        }

        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(origins);
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        // Accept the W3C trace header from frontends that propagate
        // an upstream APM trace (iter 30) so the trace-id can flow
        // through CORS preflight. Same for an explicit client-supplied
        // X-Request-Id — without listing them here, the browser
        // strips both on cross-origin POST + the backend never sees
        // the correlation hint.
        cfg.setAllowedHeaders(List.of(
            "Content-Type", "X-API-Key", "Accept",
            "X-Request-Id", "traceparent"));
        // Exposed headers: every per-response signal the SPA actually
        // reads. X-Request-Id is now exposed so support tickets can
        // include the id without an extra round-trip to the server log.
        cfg.setExposedHeaders(List.of(
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "Retry-After",
            "X-Request-Id"));
        cfg.setAllowCredentials(false);
        cfg.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/api/**", cfg);
        return src;
    }

    private static List<String> parseOrigins(String csv) {
        if (csv == null) return List.of();
        return Arrays.stream(csv.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .collect(Collectors.toList());
    }
}
