package io.netscope.billing;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure unit tests for UsageService.classify() — the static endpoint
 * classifier used by the rate-limit filter to bucket usage. The DB-write
 * path (record()) is exercised by the integration test against a real
 * PostgreSQL container; mocking JPA's EntityManager interface trips
 * bytecode instrumentation on newer JVMs, so we keep this layer pure.
 */
class UsageServiceTest {

    @Test void classify_nullAndBlank() {
        assertThat(UsageService.classify(null)).isEqualTo("other");
        assertThat(UsageService.classify("")).isEqualTo("other");
    }

    @Test void classify_pathsWithoutApiV1Prefix() {
        assertThat(UsageService.classify("/foo")).isEqualTo("other");
        assertThat(UsageService.classify("/api/v2/port/check")).isEqualTo("other");
        assertThat(UsageService.classify("/actuator/health")).isEqualTo("other");
    }

    @Test void classify_extractsFirstPathSegmentAfterApiV1() {
        assertThat(UsageService.classify("/api/v1/port/check")).isEqualTo("port");
        assertThat(UsageService.classify("/api/v1/dns/example.com")).isEqualTo("dns");
        assertThat(UsageService.classify("/api/v1/whois/foo.com")).isEqualTo("whois");
        assertThat(UsageService.classify("/api/v1/email/verify")).isEqualTo("email");
        assertThat(UsageService.classify("/api/v1/bgp/ip/8.8.8.8")).isEqualTo("bgp");
        assertThat(UsageService.classify("/api/v1/ssl/example.com")).isEqualTo("ssl");
    }

    @Test void classify_handlesPathsWithNoExtraSegments() {
        assertThat(UsageService.classify("/api/v1/port")).isEqualTo("port");
    }

    @Test void classify_blankSegmentReturnsOther() {
        assertThat(UsageService.classify("/api/v1/")).isEqualTo("other");
    }

    @Test void classify_handlesDeepPaths() {
        assertThat(UsageService.classify("/api/v1/monitor/cccc/runs/1/details")).isEqualTo("monitor");
    }
}
