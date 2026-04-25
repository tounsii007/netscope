package io.netscope.common;

import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.UnknownHostException;
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
     */
    private static final Set<String> CLOUD_METADATA = Set.of(
        "169.254.169.254",
        "fd00:ec2::254",
        "100.100.100.200",
        "192.0.0.192"
    );

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
        return CLOUD_METADATA.contains(addr.getHostAddress());
    }

    private boolean isIpLiteral(String s) {
        return s.matches("^[0-9a-fA-F:.]+$");
    }
}
