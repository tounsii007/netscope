package io.netscope.ip;

import io.netscope.common.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.net.InetAddress;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit-tests the authoritative server-side guard for the IP-Lookup tool.
 *
 * Pure-function tests — no Spring, no Redis, no HttpClient. The
 * client-side mirror lives in {@code web/lib/target-guard.ts}; both
 * have to agree on the block categories. This is the gate of last
 * resort: even if the frontend is bypassed, the backend still rejects.
 */
class IpAddressGuardTest {

    /* ── happy path ──────────────────────────────────────────────────── */

    @Test void publicIpv4PassesThrough() {
        InetAddress a = IpAddressGuard.parseAndGuard("8.8.8.8");
        assertThat(a.getHostAddress()).isEqualTo("8.8.8.8");
    }

    @Test void publicIpv6PassesThrough() {
        InetAddress a = IpAddressGuard.parseAndGuard("2606:4700:4700::1111");
        assertThat(a).isNotNull();
        assertThat(a.getAddress()).hasSize(16);
    }

    /* ── loopback ────────────────────────────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "127.0.0.1",
        "127.255.255.254",
        "::1"
    })
    void rejectsLoopback(String ip) {
        assertThatThrownBy(() -> IpAddressGuard.parseAndGuard(ip))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("reserved or internal");
    }

    /* ── RFC 1918 private networks ───────────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "10.0.0.1", "10.255.255.255",
        "172.16.0.1", "172.31.255.255",
        "192.168.0.1", "192.168.255.255"
    })
    void rejectsRfc1918(String ip) {
        assertThatThrownBy(() -> IpAddressGuard.parseAndGuard(ip))
            .isInstanceOf(ApiException.class);
    }

    /* ── Link-local ──────────────────────────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "169.254.0.1",
        "169.254.255.254",
        "fe80::1",
        "fe80::abcd:1234"
    })
    void rejectsLinkLocal(String ip) {
        assertThatThrownBy(() -> IpAddressGuard.parseAndGuard(ip))
            .isInstanceOf(ApiException.class);
    }

    /* ── Cloud metadata literals ─────────────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "169.254.169.254",   // AWS / Azure / GCP / DO / Oracle / IBM
        "100.100.100.200",   // Alibaba Cloud
        "192.0.0.192"        // Oracle legacy
    })
    void rejectsCloudMetadata(String ip) {
        assertThatThrownBy(() -> IpAddressGuard.parseAndGuard(ip))
            .isInstanceOf(ApiException.class);
    }

    /* ── IPv6 ULA fc00::/7 ───────────────────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "fc00::1",
        "fd00::ff",
        "fcff:ffff::1",
        "fdff:ffff::1"
    })
    void rejectsIpv6Ula(String ip) {
        assertThatThrownBy(() -> IpAddressGuard.parseAndGuard(ip))
            .isInstanceOf(ApiException.class);
    }

    /* ── Multicast / unspecified ─────────────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "224.0.0.1",
        "239.255.255.255",
        "0.0.0.0",
        "::"
    })
    void rejectsMulticastAndUnspecified(String ip) {
        assertThatThrownBy(() -> IpAddressGuard.parseAndGuard(ip))
            .isInstanceOf(ApiException.class);
    }

    /* ── Garbage input ───────────────────────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "",
        "   ",
        "example.com",   // hostnames must not pass — DNS endpoints handle those
        "not-an-ip",
        "8.8.8.8.8",
        "::z"
    })
    void rejectsNonIpInput(String s) {
        assertThatThrownBy(() -> IpAddressGuard.parseAndGuard(s))
            .isInstanceOf(ApiException.class);
    }

    @Test void rejectsNullInput() {
        assertThatThrownBy(() -> IpAddressGuard.parseAndGuard(null))
            .isInstanceOf(ApiException.class);
    }

    @Test void rejectsOversizeInputBeforeResolving() {
        // 60 characters of mostly dots + digits — would otherwise stress
        // InetAddress.getByName. The 45-char cap kicks in first.
        String huge = "1.2.3.4" + "5".repeat(50);
        assertThatThrownBy(() -> IpAddressGuard.parseAndGuard(huge))
            .isInstanceOf(ApiException.class);
    }

    /* ── isBlocked() consistency ─────────────────────────────────────── */

    @Test void isBlockedAgreesWithParseAndGuard() throws Exception {
        // The two entry points must classify the same set of bytes
        // identically — otherwise other call-sites (e.g. SafeHttpClient,
        // multi-source aggregator) could allow what parseAndGuard rejects.
        InetAddress publicAddr = InetAddress.getByName("8.8.8.8");
        InetAddress loopback   = InetAddress.getByName("127.0.0.1");
        InetAddress meta       = InetAddress.getByName("169.254.169.254");

        assertThat(IpAddressGuard.isBlocked(publicAddr)).isFalse();
        assertThat(IpAddressGuard.isBlocked(loopback)).isTrue();
        assertThat(IpAddressGuard.isBlocked(meta)).isTrue();
    }
}
