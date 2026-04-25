package io.netscope.common;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Adversarial test: rate-limit XFF spoofing must NOT bypass per-IP rate limits.
 *
 * Before fix: clientIp() read raw X-Forwarded-For from the request and used
 * it directly in the Redis key. An attacker sending random XFF values per
 * request got a fresh rate-limit bucket each time → rate limit bypassed.
 *
 * After fix: clientIp() ignores raw XFF and uses ServletRequest.getRemoteAddr(),
 * which Spring's forward-headers-strategy=native + Tomcat's RemoteIpValve
 * already populated from XFF AFTER validating the immediate proxy is in
 * the trusted-proxies list.
 *
 * Net effect: in tests (no proxy in front), XFF is completely ignored and
 * the bucket key is the actual TCP remote IP. In production, XFF is
 * honoured only when forwarded by a trusted load balancer.
 */
class RateLimitFilterXffTest {

    /** Build a filter without instantiating Redis — we only call clientIp(). */
    private final RateLimitFilter filter = new RateLimitFilter(null);

    @Test void clientIp_ignores_raw_XFF_header_attacker_spoofing() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("198.51.100.42");
        req.addHeader("X-Forwarded-For", "1.2.3.4");

        // The bucket key MUST be the real TCP source, not the spoofed XFF
        assertThat(filter.clientIp(req)).isEqualTo("198.51.100.42");
    }

    @Test void clientIp_uses_remoteAddr_for_random_XFF_attack() {
        // Simulate the attack: 1000 requests from same IP, different XFF each time.
        // All MUST share one rate-limit bucket.
        for (int i = 0; i < 50; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest();
            req.setRemoteAddr("198.51.100.42");
            req.addHeader("X-Forwarded-For", "1." + i + "." + i + "." + i);
            assertThat(filter.clientIp(req))
                .as("XFF spoofing must not change the bucket key")
                .isEqualTo("198.51.100.42");
        }
    }

    @Test void clientIp_handles_null_remoteAddr_gracefully() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr(null);
        assertThat(filter.clientIp(req)).isEqualTo("unknown");
    }

    @Test void clientIp_handles_blank_remoteAddr_gracefully() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("");
        assertThat(filter.clientIp(req)).isEqualTo("unknown");
    }

    @Test void clientIp_works_when_no_XFF_header_present() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("8.8.8.8");
        assertThat(filter.clientIp(req)).isEqualTo("8.8.8.8");
    }

    @Test void multiple_XFF_chain_does_not_alter_key() {
        // The chain "first-hop, second-hop, third-hop" used to give us "first-hop";
        // now we ignore it entirely.
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("198.51.100.42");
        req.addHeader("X-Forwarded-For", "203.0.113.1, 10.0.0.5, 10.0.0.6");
        assertThat(filter.clientIp(req)).isEqualTo("198.51.100.42");
    }
}
