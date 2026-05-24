package io.netscope.common;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Adversarial coverage for {@link ClientIpResolver}.
 *
 * Goals:
 *   • IPv4-mapped IPv6 inputs collapse to bare IPv4 so log greps line
 *     up across dual-stack hosts.
 *   • Zone-id suffix is stripped — fe80::1%eth0 and fe80::1%wlan0 are
 *     the same identity from the application's viewpoint.
 *   • Null / blank input is returned as null (never an empty string;
 *     downstream callers branch on null).
 *   • isLoopback recognises every form a dual-stack host might emit.
 */
class ClientIpResolverTest {

    @Test void clientIp_returns_null_when_request_is_null() {
        assertThat(ClientIpResolver.clientIp(null)).isNull();
    }

    @Test void clientIp_strips_ipv4_mapped_prefix_short_form() {
        HttpServletRequest req = Mockito.mock(HttpServletRequest.class);
        Mockito.when(req.getRemoteAddr()).thenReturn("::ffff:192.0.2.5");
        assertThat(ClientIpResolver.clientIp(req)).isEqualTo("192.0.2.5");
    }

    @Test void clientIp_strips_ipv4_mapped_prefix_long_form() {
        HttpServletRequest req = Mockito.mock(HttpServletRequest.class);
        Mockito.when(req.getRemoteAddr()).thenReturn("0:0:0:0:0:ffff:198.51.100.7");
        assertThat(ClientIpResolver.clientIp(req)).isEqualTo("198.51.100.7");
    }

    @Test void clientIp_strips_ipv6_zone_id() {
        HttpServletRequest req = Mockito.mock(HttpServletRequest.class);
        Mockito.when(req.getRemoteAddr()).thenReturn("fe80::1%eth0");
        assertThat(ClientIpResolver.clientIp(req)).isEqualTo("fe80::1");
    }

    @Test void clientIp_preserves_normal_ipv4() {
        HttpServletRequest req = Mockito.mock(HttpServletRequest.class);
        Mockito.when(req.getRemoteAddr()).thenReturn("203.0.113.42");
        assertThat(ClientIpResolver.clientIp(req)).isEqualTo("203.0.113.42");
    }

    @Test void clientIp_preserves_normal_ipv6() {
        HttpServletRequest req = Mockito.mock(HttpServletRequest.class);
        Mockito.when(req.getRemoteAddr()).thenReturn("2001:db8::1");
        assertThat(ClientIpResolver.clientIp(req)).isEqualTo("2001:db8::1");
    }

    @Test void clientIp_returns_null_for_empty_remote_addr() {
        HttpServletRequest req = Mockito.mock(HttpServletRequest.class);
        Mockito.when(req.getRemoteAddr()).thenReturn("");
        assertThat(ClientIpResolver.clientIp(req)).isNull();
    }

    @Test void clientIp_trims_surrounding_whitespace() {
        HttpServletRequest req = Mockito.mock(HttpServletRequest.class);
        Mockito.when(req.getRemoteAddr()).thenReturn("  203.0.113.5  ");
        assertThat(ClientIpResolver.clientIp(req)).isEqualTo("203.0.113.5");
    }

    /* ── normalise() corner cases ──────────────────────────────────── */

    @Test void normalise_accepts_ipv6_mapped_in_either_case() {
        // The "ffff" segment in IPv4-mapped is case-insensitive per
        // RFC 4291 §2.2. Both forms should collapse identically.
        assertThat(ClientIpResolver.normalise("::FFFF:10.0.0.1")).isEqualTo("10.0.0.1");
    }

    @Test void normalise_does_not_strip_pseudo_ipv4_mapped_when_tail_is_garbage() {
        // A malformed input like "::ffff:not-an-ip" is left intact —
        // we'd rather log the original than silently lie about the source.
        assertThat(ClientIpResolver.normalise("::ffff:not-an-ip"))
            .isEqualTo("::ffff:not-an-ip");
    }

    @Test void normalise_drops_octets_with_too_many_digits() {
        // "1.2.3.4567" has a 4-digit final octet — invalid IPv4.
        assertThat(ClientIpResolver.normalise("::ffff:1.2.3.4567"))
            .isEqualTo("::ffff:1.2.3.4567");
    }

    @Test void normalise_drops_octets_above_255() {
        assertThat(ClientIpResolver.normalise("::ffff:1.2.3.300"))
            .isEqualTo("::ffff:1.2.3.300");
    }

    /* ── isLoopback() ──────────────────────────────────────────────── */

    @Test void isLoopback_true_for_127_block() {
        assertThat(ClientIpResolver.isLoopback("127.0.0.1")).isTrue();
        assertThat(ClientIpResolver.isLoopback("127.255.255.254")).isTrue();
    }

    @Test void isLoopback_true_for_ipv6_loopback() {
        assertThat(ClientIpResolver.isLoopback("::1")).isTrue();
    }

    @Test void isLoopback_false_for_public_address() {
        assertThat(ClientIpResolver.isLoopback("8.8.8.8")).isFalse();
        assertThat(ClientIpResolver.isLoopback("2001:4860:4860::8888")).isFalse();
    }

    @Test void isLoopback_false_for_null_and_blank() {
        assertThat(ClientIpResolver.isLoopback(null)).isFalse();
        assertThat(ClientIpResolver.isLoopback("")).isFalse();
        assertThat(ClientIpResolver.isLoopback("not-an-ip")).isFalse();
    }
}
