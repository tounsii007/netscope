package io.netscope.common;

import org.springframework.stereotype.Component;

import java.net.IDN;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Blocks scans against private/loopback/cloud-metadata ranges to prevent SSRF
 * and internal reconnaissance. Resolves hostnames and validates the result.
 */
@Component
public class TargetValidator {

    private static final Pattern HOST_PATTERN =
        Pattern.compile("^(?=.{1,253}$)([a-zA-Z0-9_-]{1,63}\\.)*[a-zA-Z0-9_-]{1,63}$");

    /**
     * Cloud-provider metadata endpoints. These IPs sit outside RFC 1918
     * private space (so {@link InetAddress#isSiteLocalAddress()} won't
     * catch them) but still expose credentials/tokens when reached from
     * inside the VPC. Always block, on every cloud, just in case the
     * service is ever moved.
     *
     *   • 169.254.169.254  — AWS / Azure / GCP / DigitalOcean / Oracle / IBM
     *   • fd00:ec2::254    — AWS IPv6 IMDS
     *   • 100.100.100.200  — Alibaba Cloud
     *   • 192.0.0.192      — Oracle Cloud Infrastructure (legacy)
     *
     * Stored as raw byte arrays so byte-level comparison side-steps any
     * IPv6 string-form ambiguity (compressed vs expanded; ::ffff:v4 vs
     * pure v4). All comparisons go through {@link Arrays#equals(byte[],byte[])}.
     */
    private static final String[] CLOUD_METADATA_LITERALS = {
        "169.254.169.254",
        "fd00:ec2::254",
        "100.100.100.200",
        "192.0.0.192"
    };
    private static final Set<ByteBuf> CLOUD_METADATA_BYTES = buildMetadataSet();

    private static Set<ByteBuf> buildMetadataSet() {
        Set<ByteBuf> s = new HashSet<>();
        for (String lit : CLOUD_METADATA_LITERALS) {
            try { s.add(new ByteBuf(InetAddress.getByName(lit).getAddress())); }
            catch (UnknownHostException e) {
                throw new IllegalStateException("bad metadata literal: " + lit, e);
            }
        }
        return s;
    }

    /** Wrapper providing equals/hashCode over raw IP bytes. */
    private record ByteBuf(byte[] value) {
        @Override public boolean equals(Object o) {
            return o instanceof ByteBuf b && Arrays.equals(value, b.value);
        }
        @Override public int hashCode() { return Arrays.hashCode(value); }
    }

    public InetAddress resolveAndValidate(String target) {
        if (target == null || target.isBlank()) {
            throw ApiException.badRequest("target is required");
        }
        String trimmed = target.trim().toLowerCase();
        // Normalise IDN / Unicode hostnames to ASCII Compatible Encoding
        // (Punycode) before the pattern check. Without this:
        //   1. Legitimate non-ASCII domains (münchen.de, παράδειγμα.gr)
        //      were rejected outright even though they are real.
        //   2. Homograph-confusable inputs (cyrillic "а" mimicking latin
        //      "a", e.g. "аpple.com") looked legitimate to the regex but
        //      resolved via the resolver to a completely different host.
        //      IDN.toASCII converts BOTH to their canonical xn--… form,
        //      which the downstream resolver and the homograph host both
        //      agree on — the canonical form then goes through the same
        //      validation as any other ASCII host.
        // IDN.toASCII throws IllegalArgumentException on inputs it can't
        // canonicalise (control chars, oversized labels) — surface that
        // as a 400 instead of leaking the JDK exception.
        //
        // Flag = IDN.USE_STD3_ASCII_RULES (NOT ALLOW_UNASSIGNED). RFC 3490
        // STD3 forbids any character outside [A-Za-z0-9-] in DNS labels
        // after Punycode encoding, which is exactly the property we want
        // for SSRF defence: hostnames an attacker controls must reduce to
        // a canonical ASCII form OR be rejected. The earlier
        // ALLOW_UNASSIGNED flag was the LESS-secure option — it permits
        // currently-unassigned Unicode codepoints, exactly the surface
        // homograph attacks target while the IDNA tables update lags
        // the Unicode standard.
        if (!isIpLiteral(trimmed)) {
            try {
                trimmed = IDN.toASCII(trimmed, IDN.USE_STD3_ASCII_RULES);
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("invalid hostname (IDN normalisation failed)");
            }
        }
        if (!HOST_PATTERN.matcher(trimmed).matches() && !isIpLiteral(trimmed)) {
            throw ApiException.badRequest("invalid hostname or IP");
        }
        try {
            // SSRF hardening: a hostname can have multiple A/AAAA records
            // and getByName() returns only the first. A split-horizon DNS
            // ("first A → 8.8.8.8, second A → 127.0.0.1") could leak
            // through if we only checked the first. Iterate ALL resolved
            // addresses; reject the request if any one is blocked.
            InetAddress[] all = InetAddress.getAllByName(trimmed);
            for (InetAddress a : all) {
                if (isBlocked(a)) {
                    throw ApiException.forbidden("target is a reserved or internal address");
                }
            }
            return all[0];
        } catch (UnknownHostException e) {
            throw ApiException.badRequest("could not resolve: " + trimmed);
        }
    }

    public boolean isBlocked(InetAddress addr) {
        if (addr.isAnyLocalAddress() || addr.isLoopbackAddress()
            || addr.isLinkLocalAddress() || addr.isSiteLocalAddress()
            || addr.isMulticastAddress()) {
            return true;
        }
        byte[] raw = addr.getAddress();
        // IPv6 ULA (fc00::/7, RFC 4193) — Java's isSiteLocalAddress only
        // catches the legacy fec0::/10 range, so handle ULA explicitly.
        if (raw.length == 16 && (raw[0] & 0xfe) == 0xfc) return true;
        // IPv4-compatible IPv6 (the deprecated ::a.b.c.d form, RFC 4291
        // §2.5.5.1). Java DOES NOT report isLoopback/isLinkLocal/etc.
        // true for this form even when the embedded v4 is loopback —
        // ::127.0.0.1 silently slipped past the block list before
        // this check landed. Decode the embedded v4 and classify it.
        if (raw.length == 16 && isAllZero(raw, 0, 12)) {
            byte[] v4 = new byte[]{ raw[12], raw[13], raw[14], raw[15] };
            try { if (isBlocked(InetAddress.getByAddress(v4))) return true; }
            catch (UnknownHostException ignored) { /* impossible — 4-byte array */ }
        }
        // IPv4-only checks below — kept in sync with IpAddressGuard.isBlocked()
        // and web/lib/target-guard.ts. All three must agree on block categories.
        if (raw.length == 4) {
            int a = raw[0] & 0xff;
            int b = raw[1] & 0xff;
            // 100.64.0.0/10 — Carrier-grade NAT (RFC 6598).
            if (a == 100 && b >= 64 && b <= 127) return true;
            // 240.0.0.0/4 — reserved for future use (RFC 1112 §4).
            if (a >= 240) return true;
        }
        return CLOUD_METADATA_BYTES.contains(new ByteBuf(raw));
    }

    private static boolean isAllZero(byte[] arr, int off, int len) {
        for (int i = off; i < off + len; i++) if (arr[i] != 0) return false;
        return true;
    }

    private boolean isIpLiteral(String s) {
        return s.matches("^[0-9a-fA-F:.]+$");
    }
}
