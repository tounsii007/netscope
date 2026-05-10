package io.netscope.ip;

import io.netscope.common.ApiException;

import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * Authoritative server-side gate that decides whether an IP literal
 * is something the public IP-lookup tool should ever look up.
 *
 * Pulled out of {@link IpService} so it can be tested without the
 * surrounding Spring/RestClient/HttpClient boilerplate (those would
 * require loopback sockets, which fail in some sandboxed CI runners).
 *
 * The corresponding client-side guard lives in
 * {@code web/lib/target-guard.ts}; both have to agree on the block
 * categories. This class is the authoritative source of truth.
 */
public final class IpAddressGuard {

    private IpAddressGuard() {}

    /**
     * Parse the raw user input into an InetAddress and reject any
     * address that resolves to one of the reserved / internal ranges.
     *
     * @return canonical InetAddress, never null
     * @throws ApiException 400 for syntactically invalid input,
     *                      403 for blocked-but-valid addresses
     */
    public static InetAddress parseAndGuard(String ip) {
        if (ip == null || ip.isBlank()) throw ApiException.badRequest("invalid IP");
        String trimmed = ip.trim();
        // Length cap deflects exotic inputs (e.g. multi-MB strings) and
        // anything that is obviously not an IPv4 / IPv6 literal — the
        // longest valid form is "0000:…:255.255.255.255" at 45 chars.
        if (trimmed.length() > 45 || !trimmed.matches("^[0-9a-fA-F:.]+$")) {
            throw ApiException.badRequest("invalid IP");
        }
        InetAddress addr;
        try {
            // Crucially: never resolve a hostname here. The regex above
            // guarantees the input is a literal, so getByName() does not
            // round-trip to DNS. Hostname resolution belongs to the
            // dedicated DNS endpoints.
            addr = InetAddress.getByName(trimmed);
        } catch (UnknownHostException e) {
            throw ApiException.badRequest("invalid IP");
        }
        if (isBlocked(addr)) {
            throw ApiException.forbidden("address is reserved or internal");
        }
        return addr;
    }

    /**
     * True when the address falls into any of the categories the IP
     * lookup tool refuses to query: loopback, link-local, RFC 1918,
     * IPv6 ULA, multicast, unspecified (0.0.0.0/::), or one of the
     * cloud-metadata literals that sit outside RFC 1918 but still
     * leak credentials when reached from inside a VPC.
     */
    public static boolean isBlocked(InetAddress addr) {
        if (addr.isAnyLocalAddress() || addr.isLoopbackAddress()
            || addr.isLinkLocalAddress() || addr.isSiteLocalAddress()
            || addr.isMulticastAddress()) return true;
        byte[] raw = addr.getAddress();
        // IPv6 ULA fc00::/7 (RFC 4193). Java's isSiteLocalAddress() only
        // catches the legacy fec0::/10 range, so we handle ULA explicitly.
        if (raw.length == 16 && (raw[0] & 0xfe) == 0xfc) return true;
        return isCloudMetadata(raw);
    }

    private static boolean isCloudMetadata(byte[] raw) {
        // 169.254.169.254 — covers AWS / Azure / GCP / DO / Oracle / IBM
        if (raw.length == 4 && raw[0] == (byte) 169 && raw[1] == (byte) 254
                && raw[2] == (byte) 169 && raw[3] == (byte) 254) return true;
        // 100.100.100.200 — Alibaba Cloud
        if (raw.length == 4 && raw[0] == 100 && raw[1] == 100
                && raw[2] == 100 && raw[3] == (byte) 200) return true;
        // 192.0.0.192 — Oracle legacy
        if (raw.length == 4 && raw[0] == (byte) 192 && raw[1] == 0
                && raw[2] == 0 && raw[3] == (byte) 192) return true;
        return false;
    }
}
