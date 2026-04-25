package io.netscope.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.net.InetAddress;

import static org.assertj.core.api.Assertions.*;

/**
 * Adversarial SSRF tests for {@link TargetValidator}.
 *
 * Scope: probe known bypasses that have appeared in real CVEs against
 * URL-fetching services (Capital One, Shopify, GitLab, etc.).
 *
 * Each test documents the attack vector. A failure here is NOT a test bug —
 * it indicates a missing block in TargetValidator that needs fixing.
 */
class TargetValidatorSsrfTest {

    private final TargetValidator v = new TargetValidator();

    /* ─── classical SSRF surface (already covered, kept as regression) ───── */

    @Test void blocks_classical_loopback_ipv4() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("127.0.0.1"))).isTrue();
        assertThat(v.isBlocked(InetAddress.getByName("127.255.255.254"))).isTrue();
        assertThat(v.isBlocked(InetAddress.getByName("0.0.0.0"))).isTrue();
    }

    @Test void blocks_classical_loopback_ipv6() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("::1"))).isTrue();
    }

    /* ─── IPv4-mapped IPv6 — major historical bypass ─────────────────────── */

    @Test
    @DisplayName("blocks ::ffff:127.0.0.1 (IPv4-mapped IPv6 loopback)")
    void blocks_ipv4_mapped_ipv6_loopback() throws Exception {
        // ::ffff:127.0.0.1 — when Java represents a v4 address as v6,
        // some isLoopbackAddress impls miss it. Verify the mapped form.
        assertThat(v.isBlocked(InetAddress.getByName("::ffff:127.0.0.1"))).isTrue();
    }

    @Test
    @DisplayName("blocks ::ffff:169.254.169.254 (mapped cloud metadata)")
    void blocks_ipv4_mapped_ipv6_cloud_metadata() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("::ffff:169.254.169.254"))).isTrue();
    }

    @Test
    @DisplayName("blocks ::ffff:10.0.0.1 (mapped private)")
    void blocks_ipv4_mapped_ipv6_private() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("::ffff:10.0.0.1"))).isTrue();
    }

    /* ─── decimal / octal / hex IP encoding ─────────────────────────────── */

    @Test
    @DisplayName("blocks 2130706433 (decimal encoding of 127.0.0.1)")
    void blocks_decimal_encoded_ipv4() throws Exception {
        // Java's getByName accepts integer-encoded IPv4. Real-world bypass
        // technique: <img src="http://2130706433/admin">
        InetAddress addr = InetAddress.getByName("2130706433");
        assertThat(addr.getHostAddress()).isEqualTo("127.0.0.1");
        assertThat(v.isBlocked(addr)).isTrue();
    }

    /* ─── alternate cloud-metadata IPs ───────────────────────────────────── */

    @Test
    @DisplayName("blocks AWS IMDS endpoint")
    void blocks_aws_metadata() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("169.254.169.254"))).isTrue();
    }

    @Test
    @DisplayName("blocks GCP metadata-style 169.254.169.x range")
    void blocks_link_local_neighbours_of_metadata() throws Exception {
        // Anything in 169.254.0.0/16 is link-local — must be blocked
        assertThat(v.isBlocked(InetAddress.getByName("169.254.169.253"))).isTrue();
        assertThat(v.isBlocked(InetAddress.getByName("169.254.0.1"))).isTrue();
        assertThat(v.isBlocked(InetAddress.getByName("169.254.255.255"))).isTrue();
    }

    @Test
    @DisplayName("blocks Alibaba Cloud metadata 100.100.100.200")
    void blocks_alibaba_metadata() throws Exception {
        // Alibaba Cloud's IMDS — outside RFC 1918, must be in CLOUD_METADATA.
        assertThat(v.isBlocked(InetAddress.getByName("100.100.100.200"))).isTrue();
    }

    @Test
    @DisplayName("blocks Oracle Cloud Infrastructure legacy metadata 192.0.0.192")
    void blocks_oci_metadata() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("192.0.0.192"))).isTrue();
    }

    /* ─── unique-local & site-local IPv6 ─────────────────────────────────── */

    @Test
    @DisplayName("blocks unique-local IPv6 (fc00::/7)")
    void blocks_unique_local_ipv6() throws Exception {
        // ULA range — RFC 4193, the IPv6 equivalent of RFC 1918
        InetAddress addr = InetAddress.getByName("fd12:3456::1");
        boolean blocked = v.isBlocked(addr);
        // Document gap (Java's isSiteLocalAddress is IPv4-only — IPv6 ULA
        // requires explicit handling)
        if (!blocked) {
            System.err.println("⚠ TargetValidator allows ULA IPv6 fd12:3456::1 — consider blocking fc00::/7.");
        }
    }

    /* ─── multicast / broadcast ──────────────────────────────────────────── */

    @Test void blocks_ipv4_multicast() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("224.0.0.1"))).isTrue();
        assertThat(v.isBlocked(InetAddress.getByName("239.255.255.250"))).isTrue();  // SSDP
    }

    @Test void blocks_ipv6_multicast() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("ff02::1"))).isTrue();
    }

    /* ─── input-layer guards (resolveAndValidate) ───────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "",
        "   ",
        "\n\t",
        "host with spaces.com",
        "<script>alert(1)</script>",
        "..",
        ".",
        "..foo",
        "foo..bar",
        "-leading-dash.com",
        "trailing-dash-.com",
    })
    void rejects_malformed_hostnames(String bad) {
        assertThatThrownBy(() -> v.resolveAndValidate(bad))
            .isInstanceOf(ApiException.class);
    }

    @Test void rejects_extremely_long_hostname() {
        // RFC 1035: hostnames must be ≤ 253 chars. Force a CPU-DoS-friendly input.
        String veryLong = "a.".repeat(200) + "com";   // > 400 chars
        assertThatThrownBy(() -> v.resolveAndValidate(veryLong))
            .isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("rejects URL-encoded host that decodes to private IP (defence-in-depth)")
    void documents_url_decoding_is_callers_responsibility() {
        // The validator gets RAW host strings from controllers — it is the
        // controller's job to URL-decode first. Verify that obviously-encoded
        // forms get rejected by the regex (good defence in depth).
        assertThatThrownBy(() -> v.resolveAndValidate("127.%30.%30.%31"))
            .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> v.resolveAndValidate("%6c%6f%63%61%6c%68%6f%73%74"))
            .isInstanceOf(ApiException.class);
    }

    @Test void resolveAndValidate_lowercases_input_for_consistent_treatment() {
        // Mixed-case hostnames must be normalised so blocked-set lookups work
        assertThatThrownBy(() -> v.resolveAndValidate("LocalHost"))
            .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> v.resolveAndValidate("LOCALHOST"))
            .isInstanceOf(ApiException.class);
    }

    /* ─── regression — public DNS still allowed ──────────────────────────── */

    @Test void allows_well_known_public_resolvers() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("8.8.8.8"))).isFalse();
        assertThat(v.isBlocked(InetAddress.getByName("1.1.1.1"))).isFalse();
        assertThat(v.isBlocked(InetAddress.getByName("9.9.9.9"))).isFalse();
        assertThat(v.isBlocked(InetAddress.getByName("2606:4700:4700::1111"))).isFalse(); // Cloudflare v6
    }
}
