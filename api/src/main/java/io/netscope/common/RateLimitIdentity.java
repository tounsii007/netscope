package io.netscope.common;

import jakarta.servlet.http.HttpServletRequest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Decides which "bucket" a request lands in for rate-limiting purposes.
 *
 * Two identity shapes:
 *   • {@code k:<sha-256-truncated>}  — when the request carries an
 *     X-API-Key. The raw key is NEVER used as the bucket key — that
 *     would leak the credential into Redis MONITOR/SLOWLOG/RDB dumps
 *     and any operator with read access.
 *   • {@code ip:<addr>}              — when the request is anonymous.
 *     Source of the IP is whatever Tomcat's RemoteIpValve already
 *     validated; raw X-Forwarded-For is intentionally not consulted
 *     because it's spoofable per request.
 *
 * Splitting this out makes the rate-limit filter readable and lets
 * the identity policy evolve (e.g. add per-workspace buckets) without
 * touching the sliding-window math.
 */
public final class RateLimitIdentity {
    private RateLimitIdentity() {}

    /** Stable bucket key for this request. */
    public static String of(HttpServletRequest req, String apiKey) {
        return apiKey != null
            ? "k:" + hashFingerprint(apiKey)
            : "ip:" + clientIp(req);
    }

    /** Trust only what Tomcat's RemoteIpValve / Spring forward-headers
     *  already validated. RAW X-Forwarded-For from the network is
     *  ignored because it's spoofable per request. */
    public static String clientIp(HttpServletRequest req) {
        String addr = req.getRemoteAddr();
        return addr != null && !addr.isBlank() ? addr : "unknown";
    }

    /** 32-hex-char fingerprint of an API key. SHA-256 truncated to 16
     *  bytes gives ~3·10⁻²⁹ collision probability at 50k active keys
     *  — far more than enough for a per-key bucket. */
    public static String hashFingerprint(String apiKey) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] full = md.digest(apiKey.getBytes(StandardCharsets.UTF_8));
            byte[] prefix = new byte[16];
            System.arraycopy(full, 0, prefix, 0, 16);
            return HexFormat.of().formatHex(prefix);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed by every JDK; this branch only
            // exists to satisfy the checked-exception contract.
            return Integer.toHexString(apiKey.hashCode()) + ":" + apiKey.length();
        }
    }
}
