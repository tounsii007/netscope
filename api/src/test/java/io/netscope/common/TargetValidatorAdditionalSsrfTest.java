package io.netscope.common;
import io.netscope.common.errors.ApiException;
import io.netscope.common.security.TargetValidator;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.net.InetAddress;

import static org.assertj.core.api.Assertions.*;

/**
 * Adversarial bypass attempts that aren't covered by
 * {@link TargetValidatorSsrfTest}. Mostly closing the parity gap
 * with the FE-side adversarial suite (web/tests/target-guard-adversarial.test.ts):
 * any encoding bypass the FE guard catches must also be caught here,
 * because anyone bypassing the FE (curl, SDK, direct API call) hits
 * the backend without ever touching the JS guard.
 *
 * Each block documents the attack vector. A failing test is a real
 * regression, not a test bug.
 */
class TargetValidatorAdditionalSsrfTest {

    private final TargetValidator v = new TargetValidator();

    /* ── short-form IPv4 encodings (inet_aton-style) ───────────────────── */

    @Test
    @DisplayName("blocks short-form IPv4 127.1 → 127.0.0.1")
    void blocks_short_form_loopback() throws Exception {
        // libc/JDK both accept this and resolve it to 127.0.0.1.
        InetAddress addr = InetAddress.getByName("127.1");
        assertThat(addr.getHostAddress()).isEqualTo("127.0.0.1");
        assertThat(v.isBlocked(addr)).isTrue();
    }

    @Test
    @DisplayName("blocks 3-part short-form 127.0.1 (matches 127.0.0.1)")
    void blocks_three_part_loopback() throws Exception {
        InetAddress addr = InetAddress.getByName("127.0.1");
        assertThat(addr.getHostAddress()).isEqualTo("127.0.0.1");
        assertThat(v.isBlocked(addr)).isTrue();
    }

    @Test
    @DisplayName("blocks decimal-encoded IMDS 2852039166 → 169.254.169.254")
    void blocks_decimal_encoded_imds() throws Exception {
        InetAddress addr = InetAddress.getByName("2852039166");
        assertThat(addr.getHostAddress()).isEqualTo("169.254.169.254");
        assertThat(v.isBlocked(addr)).isTrue();
    }

    @Test
    @DisplayName("blocks decimal-encoded RFC 1918 167772161 → 10.0.0.1")
    void blocks_decimal_encoded_private() throws Exception {
        InetAddress addr = InetAddress.getByName("167772161");
        assertThat(addr.getHostAddress()).isEqualTo("10.0.0.1");
        assertThat(v.isBlocked(addr)).isTrue();
    }

    /* ── IPv6 alternate spellings of loopback ──────────────────────────── */

    @Test
    @DisplayName("blocks full-form IPv6 loopback 0:0:0:0:0:0:0:1")
    void blocks_full_form_ipv6_loopback() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("0:0:0:0:0:0:0:1"))).isTrue();
    }

    @Test
    @DisplayName("blocks zero-padded IPv6 loopback 0000:…:0001")
    void blocks_zero_padded_ipv6_loopback() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName(
            "0000:0000:0000:0000:0000:0000:0000:0001"))).isTrue();
    }

    @Test
    @DisplayName("blocks compressed-alt IPv6 loopback 0::1")
    void blocks_zero_compressed_ipv6_loopback() throws Exception {
        assertThat(v.isBlocked(InetAddress.getByName("0::1"))).isTrue();
    }

    @Test
    @DisplayName("blocks IPv6 link-local fe80::1 (zone-less)")
    void blocks_link_local_zone_less() throws Exception {
        // Zone-id forms like "fe80::1%eth0" are interface-bound and
        // resolved differently per JVM/runner. The base case
        // "fe80::1" must always be flagged as link-local — that's
        // what TargetValidator.isBlocked relies on
        // (InetAddress.isLinkLocalAddress()).
        InetAddress addr = InetAddress.getByName("fe80::1");
        assertThat(v.isBlocked(addr)).isTrue();
    }

    @Test
    @DisplayName("blocks AWS IMDS over IPv6 (fd00:ec2::254)")
    void blocks_aws_ipv6_imds() throws Exception {
        // ULA fd00::/8 is caught by the ULA range check (RFC 4193)
        // but the AWS IPv6 metadata endpoint sits inside it. Make
        // the regression visible.
        assertThat(v.isBlocked(InetAddress.getByName("fd00:ec2::254"))).isTrue();
    }

    @Test
    @DisplayName("blocks IPv6 wildcard ::")
    void blocks_ipv6_wildcard() throws Exception {
        // :: is the "any-local" address — equivalent to 0.0.0.0 on IPv4.
        // Java reports it as isAnyLocalAddress() == true.
        assertThat(v.isBlocked(InetAddress.getByName("::"))).isTrue();
    }

    @Test
    @DisplayName("blocks IPv4-compatible IPv6 ::127.0.0.1 (deprecated form)")
    void blocks_ipv4_compatible_form() throws Exception {
        // RFC 4291 §2.5.5.1 — deprecated "IPv4-compatible" form. Some
        // resolvers still accept it; isLoopbackAddress() returns true
        // for the embedded v4 loopback in modern JVMs.
        InetAddress addr = InetAddress.getByName("::127.0.0.1");
        assertThat(v.isBlocked(addr)).isTrue();
    }

    /* ── resolveAndValidate input-layer (hostname forms) ──────────────── */

    @ParameterizedTest
    @DisplayName("rejects loopback aliases by hostname")
    @ValueSource(strings = {
        "localhost",
        "LocalHost",
        "LOCALHOST",
        "localhost.",                          // FQDN canonical form
        "localhost.localdomain",               // Linux /etc/hosts alias
        "ip6-localhost",
        "ip6-loopback",
    })
    void rejects_loopback_aliases(String name) {
        assertThatThrownBy(() -> v.resolveAndValidate(name))
            .isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("rejects URL with userinfo (user:pass@host)")
    void rejects_userinfo_form() {
        // The validator gets a host string from controllers — userinfo
        // shouldn't ever reach it. But if a caller passes one through
        // by accident, the regex should reject it rather than try to
        // resolve "user:pass@example.com".
        assertThatThrownBy(() -> v.resolveAndValidate("user:pass@example.com"))
            .isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("rejects host with embedded null byte (CVE-2020-1968 class)")
    void rejects_null_byte_injection() {
        // \0 truncation tricks have shown up across runtimes.
        // Verify the validator rejects them outright.
        assertThatThrownBy(() -> v.resolveAndValidate("example.com\0internal.lan"))
            .isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("rejects host with CR/LF injection (response-splitting class)")
    void rejects_crlf_injection() {
        assertThatThrownBy(() -> v.resolveAndValidate("example.com\r\nHost: internal"))
            .isInstanceOf(ApiException.class);
    }

    /* ── DNS-rebinding contract documentation ─────────────────────────── */

    @Test
    @DisplayName("resolveAndValidate returns a resolved InetAddress (DNS-rebinding contract)")
    void contract_returns_resolved_address_not_hostname() throws Exception {
        // The defence against DNS rebinding is: resolve ONCE, validate the
        // resolved IP, and use that resolved IP for any subsequent network
        // call. A controller that takes the returned InetAddress and calls
        // .getHostAddress() / .getAddress() is safe; one that ignores the
        // return value and re-uses the original hostname string is not.
        //
        // This test locks the contract: the return value is an InetAddress,
        // not a String. Subverting that requires deliberate refactor and
        // would show up in code review.
        InetAddress resolved = v.resolveAndValidate("8.8.8.8");
        assertThat(resolved).isNotNull();
        // For a literal IP, the resolved address must equal what was passed.
        assertThat(resolved.getHostAddress()).isEqualTo("8.8.8.8");
    }

    @Test
    @DisplayName("regression: known-good Google DNS still resolves and validates")
    void allows_well_known_public_dns() throws Exception {
        // Sanity-check: the validator's reject list must not be so wide
        // that legitimate diagnostics like "look up Google DNS" break.
        InetAddress resolved = v.resolveAndValidate("8.8.8.8");
        assertThat(v.isBlocked(resolved)).isFalse();
    }
}
