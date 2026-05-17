package io.netscope.config;

import io.netscope.auth.ApiKeyFilter;
import io.netscope.common.RateLimitFilter;
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
                // Cache-Control: no-store on every API response. We
                // never want a shared proxy / CDN to cache an API
                // payload — even a 200 may carry per-user data, an
                // ephemeral rate-limit budget header, or a once-only
                // token. Static assets are served from /static/** via
                // the frontend, not from /api/**, so no false positive.
                .addHeaderWriter((req, res) -> {
                    String p = req.getRequestURI();
                    if (p != null && p.startsWith("/api/")) {
                        res.setHeader("Cache-Control", "no-store");
                        res.setHeader("Pragma", "no-cache");
                    }
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
