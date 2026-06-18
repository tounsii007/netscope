package io.netscope.config.security;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.header.writers.PermissionsPolicyHeaderWriter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.header.writers.CrossOriginOpenerPolicyHeaderWriter;
import org.springframework.security.web.header.writers.CrossOriginResourcePolicyHeaderWriter;

/**
 * Centralises every HTTP-response security header the API ships.
 * Keeping CSP / HSTS / COEP / COOP / CORP / Permissions-Policy /
 * Cache-Control wiring in one focused class — instead of inline inside
 * the SecurityFilterChain builder — makes the policy auditable as a
 * single document, and lets {@link io.netscope.config.SecurityConfig}
 * read like "compose A, then B, then C".
 *
 * Apply with {@link #apply(HttpSecurity)} inside a
 * {@code SecurityFilterChain} bean.
 */
public final class SecurityHeadersWriter {

    private SecurityHeadersWriter() {}

    public static HttpSecurity apply(HttpSecurity http) throws Exception {
        return http.headers(h -> h
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
                CrossOriginOpenerPolicyHeaderWriter.CrossOriginOpenerPolicy.SAME_ORIGIN))
            .crossOriginResourcePolicy(c -> c.policy(
                CrossOriginResourcePolicyHeaderWriter.CrossOriginResourcePolicy.SAME_ORIGIN))
            // Cross-Origin-Embedder-Policy: credentialless. The API is
            // consumed exclusively by our own SPA over CORS;
            // credentialless gives us the crossOriginIsolated capability
            // without requiring third-party callers to serve CORP
            // headers on every byte they fetch. require-corp would be
            // stricter but would break legitimate API clients that
            // issue parallel requests with cookies attached.
            //
            // Written via addHeaderWriter rather than the typed
            // crossOriginEmbedderPolicy(...) DSL because Spring
            // Security 6.4/6.5's CrossOriginEmbedderPolicy enum only
            // exposes REQUIRE_CORP and UNSAFE_NONE — the credentialless
            // value was added later. Setting the raw header decouples
            // us from that enum's roll-out.
            .addHeaderWriter((req, res) -> res.setHeader("Cross-Origin-Embedder-Policy", "credentialless"))
            // Origin-Agent-Cluster: ?1 hints the browser to put this
            // origin in its own agent cluster (process isolation).
            // Cheap defensive measure that helps mitigate cross-origin
            // sidechannel attacks.
            .addHeaderWriter((req, res) -> res.setHeader("Origin-Agent-Cluster", "?1"))
            // Per-path Cache-Control. See CacheControlPolicy for the
            // mutating-vs-idempotent classification used here.
            .addHeaderWriter((req, res) -> {
                String cc = CacheControlPolicy.resolveCacheControl(req.getRequestURI());
                if (cc == null) return;
                res.setHeader("Cache-Control", cc);
                if ("no-store".equals(cc)) res.setHeader("Pragma", "no-cache");
            })
            // X-Permitted-Cross-Domain-Policies: none.
            // Mirrors the frontend (next.config.ts) — disables legacy
            // Flash/Acrobat crossdomain.xml lookups so an attacker
            // can't hijack a stale crossdomain.xml on this host to
            // bypass SOP via the Flash plugin's historical loopholes.
            // Cheap, header-only, no runtime cost.
            .addHeaderWriter((req, res) -> res.setHeader("X-Permitted-Cross-Domain-Policies", "none"))
        );
    }
}
