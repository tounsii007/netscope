package io.netscope.bgp;

import com.fasterxml.jackson.databind.JsonNode;
import io.netscope.common.errors.ApiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for BgpController input validation.
 *
 * The actual RIPE-Stat HTTP calls are exercised by an integration test
 * with WireMock — this suite covers the cheap, fast input guards that
 * defend against malformed or malicious URL parameters before any
 * outbound request is made.
 *
 * We subclass BgpController and override {@link BgpController#ripe} so
 * the "valid input → network call → wrapped failure" tests don't depend
 * on stat.ripe.net being unreachable from the test environment. On CI
 * runners with internet access the real endpoint actually answers, and
 * the previous tests then failed because they expected a throwable that
 * never came.
 */
class BgpControllerTest {

    private final BgpController ctrl = new BgpController() {
        @Override protected JsonNode ripe(String endpoint, String resource) {
            throw new RuntimeException("test: simulated upstream failure");
        }
    };

    /* ─── /api/v1/bgp/ip/{ip} ────────────────────────────────────────────── */

    @Test void ip_rejects_invalid_characters() {
        assertThatThrownBy(() -> ctrl.ip("hello world"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid IP");
    }

    @Test void ip_rejects_url_injection_attempt() {
        assertThatThrownBy(() -> ctrl.ip("8.8.8.8/../../etc/passwd"))
            .isInstanceOf(ApiException.class);
    }

    @Test void ip_rejects_script_tag() {
        assertThatThrownBy(() -> ctrl.ip("<script>alert(1)</script>"))
            .isInstanceOf(ApiException.class);
    }

    @Test void ip_accepts_ipv4_and_ipv6_formats_through_regex_guard() {
        // The regex permits hex/colon/dot — actual semantic validity is
        // checked by RIPE upstream. We test only that the cheap guard lets
        // well-formed input pass to the network call (which we don't make
        // here, so we expect an ApiException wrapping the network failure).
        assertThatThrownBy(() -> ctrl.ip("8.8.8.8"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("RIPE lookup failed");

        assertThatThrownBy(() -> ctrl.ip("2001:4860:4860::8888"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("RIPE lookup failed");
    }

    /* ─── /api/v1/bgp/asn/{asn} ──────────────────────────────────────────── */

    @Test void asn_rejects_non_numeric() {
        assertThatThrownBy(() -> ctrl.asn("ASfoo"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid ASN");

        assertThatThrownBy(() -> ctrl.asn("12a45"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid ASN");

        assertThatThrownBy(() -> ctrl.asn(""))
            .isInstanceOf(ApiException.class);
    }

    @Test void asn_strips_AS_prefix_then_validates() {
        // Valid number but fails on outbound HTTP — proves the guard passed
        assertThatThrownBy(() -> ctrl.asn("AS15169"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("RIPE lookup failed");
    }

    @Test void asn_handles_lowercase_as_prefix() {
        assertThatThrownBy(() -> ctrl.asn("as15169"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("RIPE lookup failed");
    }

    @Test void asn_accepts_bare_number() {
        assertThatThrownBy(() -> ctrl.asn("32934"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("RIPE lookup failed");
    }

    /* ─── fallback methods ───────────────────────────────────────────────── */

    @Test void ipFallback_returns_degraded_response() {
        var fallback = ctrl.ipFallback("8.8.8.8", new RuntimeException("circuit open"));
        assertThat(fallback)
            .containsEntry("ip", "8.8.8.8")
            .containsEntry("degraded", true)
            .containsEntry("reason", "RIPE Stat unavailable");
    }

    @Test void asnFallback_returns_degraded_response() {
        var fallback = ctrl.asnFallback("AS15169", new RuntimeException("timeout"));
        assertThat(fallback)
            .containsEntry("asn", "AS15169")
            .containsEntry("degraded", true)
            .containsEntry("reason", "RIPE Stat unavailable");
    }
}
