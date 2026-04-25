package io.netscope.common;

import org.springframework.stereotype.Component;

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
        if (!HOST_PATTERN.matcher(trimmed).matches() && !isIpLiteral(trimmed)) {
            throw ApiException.badRequest("invalid hostname or IP");
        }
        try {
            InetAddress addr = InetAddress.getByName(trimmed);
            if (isBlocked(addr)) {
                throw ApiException.forbidden("target is a reserved or internal address");
            }
            return addr;
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
        // IPv6 ULA (fc00::/7, RFC 4193) — Java's isSiteLocalAddress only
        // catches the legacy fec0::/10 range, so handle ULA explicitly.
        byte[] raw = addr.getAddress();
        if (raw.length == 16 && (raw[0] & 0xfe) == 0xfc) return true;
        return CLOUD_METADATA_BYTES.contains(new ByteBuf(raw));
    }

    private boolean isIpLiteral(String s) {
        return s.matches("^[0-9a-fA-F:.]+$");
    }
}
