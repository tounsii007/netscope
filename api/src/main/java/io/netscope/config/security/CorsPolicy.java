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

        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(origins);
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Content-Type", "X-API-Key", "Accept"));
        cfg.setExposedHeaders(List.of(
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "Retry-After"));
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
