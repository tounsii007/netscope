package io.netscope.config;

import io.netscope.auth.ApiKeyFilter;
import io.netscope.common.RequestIdFilter;
import io.netscope.common.ratelimit.RateLimitFilter;
import io.netscope.config.security.CacheControlPolicy;
import io.netscope.config.security.CorsPolicy;
import io.netscope.config.security.SecurityHeadersWriter;
import io.netscope.user.SessionFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * Thin composer of the API's security filter chain.
 *
 * All substantive policy lives in {@link io.netscope.config.security}:
 *
 *   • {@link CacheControlPolicy}     — per-path Cache-Control decision
 *   • {@link SecurityHeadersWriter}  — CSP / HSTS / COEP / COOP / CORP / …
 *   • {@link CorsPolicy}             — origin-whitelist parsing + validation
 *
 * Keeping this file thin makes the trust-boundary read like a flow:
 * filter ordering → auth gates → headers → CORS. The detail policies
 * stay in their own files so each can be audited independently.
 */
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
                // F-RD3-03: /api/v1/auth/** is permitAll because callers
                // are unauthenticated by definition (signing in). CSRF
                // protection for /exchange is provided by the one-shot
                // sign-in ticket minted at /auth/start — it binds the
                // exchange to a backend-initiated sign-in attempt and
                // closes the bearer-replay window.
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
                // F-RD3-03: covers /api/v1/auth/start (one-shot ticket
                // mint — caller is unauthenticated by definition) AND
                // /api/v1/auth/exchange (ticket-bound JWT mint). The
                // ticket itself is the proof-of-intent for /exchange.
                .requestMatchers("/api/v1/auth/**").permitAll()
                .anyRequest().permitAll() // fine-grained auth handled by ApiKey/Session filters
            )
            // RequestIdFilter must run first so every subsequent filter
            // (rate-limit, api-key, session) and every controller log
            // line picks up the correlation id from MDC.
            .addFilterBefore(requestIdFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(rateLimitFilter, RequestIdFilter.class)
            .addFilterAfter(apiKeyFilter, RateLimitFilter.class)
            .addFilterAfter(sessionFilter, ApiKeyFilter.class);
        SecurityHeadersWriter.apply(http);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        return CorsPolicy.build(allowedOrigins);
    }

    /* ─── Package-private classification accessors for legacy tests ─── */
    // These delegate to {@link CacheControlPolicy} so the existing
    // CacheControlPolicyTest stays valid without an import churn in the
    // same PR. New tests should reference CacheControlPolicy directly.

    static boolean isMutatingOrUserState(String path) {
        return CacheControlPolicy.isMutatingOrUserState(path);
    }

    static boolean isIdempotentLookup(String path) {
        return CacheControlPolicy.isIdempotentLookup(path);
    }

    static String resolveCacheControl(String path) {
        return CacheControlPolicy.resolveCacheControl(path);
    }
}
