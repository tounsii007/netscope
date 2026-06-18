package io.netscope.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Locks in which paths are cacheable and which are not.
 *
 * Errors in classification leak in two directions:
 *   • False idempotent (a mutating endpoint cached) → stale or
 *     cross-user data served by the browser cache.
 *   • False mutating (a hot lookup forced to no-store) → user
 *     experience regression on every re-click.
 *
 * Both are silent until users hit them in prod, so the regression
 * surface is locked here.
 */
class CacheControlPolicyTest {

    /* ─── mutating / user-state prefixes ───────────────────────────────── */

    @Test void auth_endpoints_are_mutating() {
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/auth/login")).isTrue();
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/auth/refresh")).isTrue();
    }

    @Test void billing_endpoints_are_mutating() {
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/billing/checkout")).isTrue();
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/billing/portal")).isTrue();
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/billing/webhook")).isTrue();
    }

    @Test void monitor_and_workspace_endpoints_are_mutating() {
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/monitor")).isTrue();
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/monitor/abc")).isTrue();
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/workspaces/xyz")).isTrue();
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/api-keys")).isTrue();
    }

    @Test void caller_specific_endpoints_are_mutating() {
        // /ip/me returns the caller's own geo — caching it cross-user
        // would leak the cache to another visitor. Distinct from /ip/{ip}
        // which is identical for every caller.
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/ip/me")).isTrue();
    }

    @Test void websocket_probe_is_mutating() {
        // Handshake RTT changes per call; caching would freeze a stale
        // latency reading.
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/websocket")).isTrue();
    }

    @Test void telemetry_sinks_are_mutating() {
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/csp-report")).isTrue();
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/log")).isTrue();
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/vitals")).isTrue();
    }

    /* ─── idempotent lookup prefixes ───────────────────────────────────── */

    @Test void dns_lookups_are_cacheable() {
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/dns/example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/dns-propagation/example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/dnssec/example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/doh/example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/dkim/example.com")).isTrue();
    }

    @Test void ip_literal_lookup_is_cacheable_but_ip_me_is_not() {
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/ip/8.8.8.8")).isTrue();
        // Mutating list catches /ip/me BEFORE the prefix check would
        // accidentally bucket it as a lookup — that's why the caller
        // tests isMutating FIRST. We verify both flags here so a
        // future reorder can't silently change the policy.
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/ip/me")).isTrue();
    }

    @Test void security_inspectors_are_cacheable() {
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/ssl/example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/ssl-grade/example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/ct-logs/example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/blacklist/8.8.8.8")).isTrue();
    }

    @Test void web_analysis_endpoints_are_cacheable() {
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/headers?url=https://example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/redirect?url=https://example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/cookies?url=https://example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/opengraph?url=https://example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/robots/example.com")).isTrue();
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/mixed-content?url=https://example.com")).isTrue();
    }

    @Test void unknown_endpoints_fall_through_to_neither_list() {
        // Anything not pre-classified gets the conservative no-store
        // default in the caller. Locking that fallback path here.
        assertThat(SecurityConfig.isIdempotentLookup("/api/v1/something-new")).isFalse();
        assertThat(SecurityConfig.isMutatingOrUserState("/api/v1/something-new")).isFalse();
    }

    @Test void non_api_paths_are_neither() {
        assertThat(SecurityConfig.isIdempotentLookup("/static/style.css")).isFalse();
        assertThat(SecurityConfig.isMutatingOrUserState("/")).isFalse();
    }

    /* ─── composed dispatcher (precedence + fallback) ──────────────────── */

    @Test void resolveCacheControl_returns_null_for_non_api_paths() {
        // The writer is wired to skip the header entirely for non-/api/
        // routes. Locking that behaviour here so a future refactor can't
        // accidentally emit no-store on static assets and tank cache hit
        // rate at the CDN.
        assertThat(SecurityConfig.resolveCacheControl(null)).isNull();
        assertThat(SecurityConfig.resolveCacheControl("/")).isNull();
        assertThat(SecurityConfig.resolveCacheControl("/_next/static/foo.js")).isNull();
        assertThat(SecurityConfig.resolveCacheControl("/static/style.css")).isNull();
    }

    @Test void resolveCacheControl_picks_mutating_BEFORE_idempotent_for_ip_me() {
        // /ip/me would match BOTH classifiers because the idempotent
        // list contains "/api/v1/ip/" as a prefix. This test asserts
        // the writer's precedence (mutating wins) so /ip/me never gets
        // a cacheable Cache-Control header that would leak the caller's
        // own geo to another user via the browser cache. The matching
        // pure-idempotent /ip/8.8.8.8 path proves the OTHER branch is
        // still reachable when the path doesn't hit the mutating list.
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/ip/me"))
            .isEqualTo("no-store");
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/ip/8.8.8.8"))
            .isEqualTo("private, max-age=120, stale-while-revalidate=300");
    }

    @Test void resolveCacheControl_emits_cacheable_for_pure_idempotent_lookups() {
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/dns/example.com"))
            .isEqualTo("private, max-age=120, stale-while-revalidate=300");
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/ssl/example.com"))
            .isEqualTo("private, max-age=120, stale-while-revalidate=300");
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/headers?url=https://example.com"))
            .isEqualTo("private, max-age=120, stale-while-revalidate=300");
    }

    @Test void resolveCacheControl_emits_no_store_for_mutating_surfaces() {
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/auth/login"))
            .isEqualTo("no-store");
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/billing/checkout"))
            .isEqualTo("no-store");
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/webhook/abc"))
            .isEqualTo("no-store");
    }

    @Test void resolveCacheControl_falls_back_to_no_store_for_unknown_api_paths() {
        // Any /api/* path that doesn't appear in either classifier list
        // gets the conservative no-store default. The "could be safe but
        // we don't know" answer is to NOT cache.
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/something-new"))
            .isEqualTo("no-store");
        assertThat(SecurityConfig.resolveCacheControl("/api/v1/experimental/probe"))
            .isEqualTo("no-store");
    }
}
