package io.netscope.config;

import io.netscope.auth.ApiKeyFilter;
import io.netscope.common.ratelimit.RateLimitFilter;
import io.netscope.common.RequestIdFilter;
import io.netscope.user.SessionFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.autoconfigure.security.servlet.EndpointRequest;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.PermissionsPolicyHeaderWriter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Configuration
public class SecurityConfig {

    @Value("${netscope.cors.allowed-origins}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http, ApiKeyFilter apiKeyFilter,
            SessionFilter sessionFilter, RateLimitFilter rateLimitFilter,
            RequestIdFilter requestIdFilter) throws Exception {
        http
            .csrf(csrf -> csrf.ignoringRequestMatchers(
                "/api/v1/billing/webhook",           // Stripe sends raw body with its own signature
                "/api/v1/status-pages/public/**",    // public, no session
                "/api/v1/auth/**"
            ).disable())
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .formLogin(f -> f.disable())
            .httpBasic(b -> b.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(EndpointRequest.to(HealthEndpoint.class)).permitAll()
                .requestMatchers(EndpointRequest.toAnyEndpoint()).denyAll()
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/v1/billing/webhook").permitAll()
                .requestMatchers("/api/v1/status-pages/public/**").permitAll()
                .requestMatchers("/api/v1/auth/**").permitAll()
                .anyRequest().permitAll() // fine-grained auth handled by ApiKey/Session filters
            )
            // RequestIdFilter must run first so every subsequent
            // filter (rate-limit, api-key, session) and every controller
            // log line picks up the correlation id from MDC.
            .addFilterBefore(requestIdFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(rateLimitFilter, RequestIdFilter.class)
            .addFilterAfter(apiKeyFilter, RateLimitFilter.class)
            .addFilterAfter(sessionFilter, ApiKeyFilter.class)
            .headers(h -> h
                .contentSecurityPolicy(c -> c.policyDirectives(
                    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"))
                .httpStrictTransportSecurity(hsts -> hsts
                    .includeSubDomains(true).preload(true).maxAgeInSeconds(31536000)
                    // Spring Security's default HstsHeaderWriter only emits
                    // the header on requests it considers secure (HTTPS at
                    // the servlet layer). Production runs behind a TLS-
                    // terminating proxy (Cloudflare / Vercel) so the
                    // servlet sees HTTP, and HSTS would never go out
                    // without this override. AnyRequest matcher is the
                    // right pick: the proxy already enforces TLS, our
                    // job is to ship the header so browsers remember.
                    .requestMatcher(req -> true))
                .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                .permissionsPolicyHeader(p -> p.policy(
                    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
                        + "magnetometer=(), microphone=(), payment=(), usb=()"))
                .frameOptions(f -> f.deny())
                .crossOriginOpenerPolicy(c -> c.policy(
                    org.springframework.security.web.header.writers.CrossOriginOpenerPolicyHeaderWriter
                        .CrossOriginOpenerPolicy.SAME_ORIGIN))
                .crossOriginResourcePolicy(c -> c.policy(
                    org.springframework.security.web.header.writers.CrossOriginResourcePolicyHeaderWriter
                        .CrossOriginResourcePolicy.SAME_ORIGIN))
                // Cross-Origin-Embedder-Policy: credentialless. The API
                // is consumed exclusively by our own SPA over CORS;
                // credentialless gives us the crossOriginIsolated
                // capability without requiring third-party callers to
                // serve CORP headers on every byte they fetch. require-corp
                // would be stricter but would break legitimate API
                // clients that issue parallel requests with cookies
                // attached.
                //
                // Written via addHeaderWriter rather than the typed
                // crossOriginEmbedderPolicy(...) DSL because Spring
                // Security 6.4/6.5's CrossOriginEmbedderPolicy enum
                // only exposes REQUIRE_CORP and UNSAFE_NONE — the
                // credentialless value was added later. Setting the
                // raw header decouples us from that enum's roll-out.
                .addHeaderWriter((req, res) -> res.setHeader("Cross-Origin-Embedder-Policy", "credentialless"))
                // Origin-Agent-Cluster: ?1 hints the browser to put
                // this origin in its own agent cluster (process
                // isolation). Cheap defensive measure that helps
                // mitigate cross-origin sidechannel attacks.
                .addHeaderWriter((req, res) -> res.setHeader("Origin-Agent-Cluster", "?1"))
                // Cache-Control per endpoint:
                //
                //   • Mutating + user-state surfaces (auth, billing,
                //     monitor, user, workspaces, api-keys, webhooks) stay
                //     on `no-store, Pragma: no-cache` — these responses
                //     can carry session-bound data or one-shot tokens
                //     that MUST NOT be cached by anything between us
                //     and the user.
                //
                //   • Idempotent public lookup endpoints (DNS / IP /
                //     SSL / CT logs / DoH / DKIM / whois / headers /
                //     opengraph / robots / mixed-content) emit
                //     `private, max-age=120, stale-while-revalidate=300`
                //     so the same SPA tab re-clicking the same target
                //     gets an instant response. `private` is
                //     deliberate — shared proxies / CDNs must NOT
                //     cache because each response still ships the
                //     caller's own X-RateLimit-* triplet and mixing
                //     those across users would leak ratelimit state.
                //
                //   • Anything not in the above two lists keeps the
                //     conservative `no-store` default.
                //
                // Static assets are served from /_next/static/** via the
                // frontend, not from /api/**, so this never collides with
                // the long-cache policy on hashed-name assets.
                .addHeaderWriter((req, res) -> {
                    String cc = resolveCacheControl(req.getRequestURI());
                    if (cc == null) return;
                    res.setHeader("Cache-Control", cc);
                    if ("no-store".equals(cc)) res.setHeader("Pragma", "no-cache");
                })
                // X-Permitted-Cross-Domain-Policies: none.
                // Mirrors the frontend (next.config.ts) — disables
                // legacy Flash/Acrobat `crossdomain.xml` lookups so an
                // attacker can't hijack a stale crossdomain.xml on
                // this host to bypass SOP via the Flash plugin's
                // historical loopholes. Cheap, header-only, no
                // runtime cost.
                .addHeaderWriter((req, res) -> res.setHeader("X-Permitted-Cross-Domain-Policies", "none"))
            );
        return http.build();
    }

    /**
     * Path prefixes that carry per-user state or accept mutations.
     * Anything matching these MUST NOT be cached anywhere — even a 200
     * may include a one-shot token or session-bound payload.
     *
     * Kept package-private so the unit test in
     * {@code CacheControlPolicyTest} can exercise the classification
     * directly without bringing up Spring.
     */
    static final String[] MUTATING_PREFIXES = {
        "/api/v1/auth/",
        "/api/v1/billing/",
        "/api/v1/monitor",
        "/api/v1/user",
        "/api/v1/users",
        "/api/v1/workspaces",
        "/api/v1/api-keys",
        "/api/v1/webhook",
        // CSP reports land at /api/csp-report on the Next.js frontend
        // (see next.config.ts → "report-uri /api/csp-report") — there is
        // no backend route at /api/v1/csp-report. The previous entry
        // here was dead config.
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
    static final String[] IDEMPOTENT_LOOKUP_PREFIXES = {
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

    static boolean isMutatingOrUserState(String path) {
        for (String p : MUTATING_PREFIXES) {
            if (path.startsWith(p)) return true;
        }
        return false;
    }

    static boolean isIdempotentLookup(String path) {
        // /ip/me hits the mutating list ABOVE first; this only matches
        // /ip/{ip-literal} lookups. Same precedence in the caller.
        for (String p : IDEMPOTENT_LOOKUP_PREFIXES) {
            if (path.startsWith(p)) return true;
        }
        return false;
    }

    /**
     * Decide the {@code Cache-Control} value for an API request path.
     * Extracted as a package-private static method so the
     * {@code CacheControlPolicyTest} can lock the FULL classification
     * pipeline (precedence + fallback) rather than each helper in
     * isolation. Returns {@code null} for non-/api/ paths so the
     * caller knows to skip the header entirely.
     *
     *   • mutating + user-state surfaces  → {@code "no-store"}
     *   • idempotent lookup surfaces      → {@code "private, max-age=120, stale-while-revalidate=300"}
     *   • everything else under /api/     → {@code "no-store"} (conservative default)
     *   • outside /api/                   → {@code null}
     */
    static String resolveCacheControl(String path) {
        if (path == null || !path.startsWith("/api/")) return null;
        if (isMutatingOrUserState(path)) return "no-store";
        if (isIdempotentLookup(path)) {
            return "private, max-age=120, stale-while-revalidate=300";
        }
        return "no-store";
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        // Trim + filter empty entries. If the env var is empty/missing, FAIL
        // FAST at boot rather than silently defaulting Spring's CORS layer to
        // accept any origin — that would void the entire same-origin policy
        // for our API.
        List<String> origins = (allowedOrigins == null ? List.<String>of()
            : Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList()));
        if (origins.isEmpty()) {
            throw new IllegalStateException(
                "netscope.cors.allowed-origins must be set to one or more origins; "
                    + "e.g. CORS_ORIGINS=https://app.netscope.io,https://staging.netscope.io");
        }
        // Disallow wildcard '*' in production — it negates the whitelist.
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
}
