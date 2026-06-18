package io.netscope.common.security;

import jakarta.servlet.http.HttpServletRequest;

import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * Single source of truth for "what's the client's IP address?".
 *
 * Several code paths used to read {@code X-Forwarded-For} directly
 * from the request, take the first hop, and treat that as the client.
 * That's spoofable per-request — an attacker just sets the header to
 * anything and the application attributes the event / cache entry /
 * audit row to the spoofed source.
 *
 * The correct approach for this stack: trust Tomcat's RemoteIpValve
 * (Spring Boot enables it via {@code server.forward-headers-strategy=native})
 * to validate XFF against a known proxy allow-list and rewrite
 * {@code req.getRemoteAddr()}. We then read {@code getRemoteAddr()}
 * directly and stop touching the raw header.
 *
 * If RemoteIpValve isn't configured (single-instance Docker behind no
 * proxy), {@code getRemoteAddr()} still returns the TCP source IP —
 * the truthful client. The behaviour degrades safely either way.
 *
 * Normalisation
 * ─────────────
 * On dual-stack hosts Tomcat sometimes returns IPv4 addresses in
 * IPv4-mapped IPv6 form ({@code ::ffff:1.2.3.4}) and IPv6 zone-ids
 * appended via {@code %}. Both forms confuse downstream code that
 * compares strings ("is this admin's IP?"). We normalise both to
 * their canonical short form so rate-limit buckets, audit rows and
 * support-ticket greps line up.
 */
public final class ClientIpResolver {
    private ClientIpResolver() {}

    /**
     * Return the validated client IP, or {@code null} if the request
     * is null. Strips IPv4-mapped IPv6 prefix and IPv6 zone-id so the
     * output is the canonical, short, comparable form.
     *
     * Never returns the raw {@code X-Forwarded-For} value — Tomcat's
     * RemoteIpValve has already done the trusted-proxy check and
     * stored the result on the request itself.
     */
    public static String clientIp(HttpServletRequest req) {
        if (req == null) return null;
        return normalise(req.getRemoteAddr());
    }

    /**
     * Strip IPv4-mapped IPv6 prefix and zone-id suffix. Inputs and
     * their expected outputs:
     *
     *   ::ffff:1.2.3.4        →  1.2.3.4
     *   ::1                   →  ::1
     *   fe80::1%eth0          →  fe80::1
     *   1.2.3.4               →  1.2.3.4
     *   null / ""             →  null
     *
     * Package-visible for direct testing without going through a
     * servlet request.
     */
    static String normalise(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty()) return null;

        // Zone-id (scope) only matters inside the kernel routing
        // table; from an application's identity perspective it's just
        // noise. fe80::1%eth0 and fe80::1%wlan0 are still the same
        // host from the user's point of view.
        int pct = s.indexOf('%');
        if (pct >= 0) s = s.substring(0, pct);

        // IPv4-mapped IPv6: ::ffff:1.2.3.4 - keep the IPv4 form.
        // Two flavours seen in the wild: with and without the leading
        // double-colon collapse.
        if (s.regionMatches(true, 0, "::ffff:", 0, 7)) {
            String tail = s.substring(7);
            if (looksLikeIpv4(tail)) return tail;
        } else if (s.regionMatches(true, 0, "0:0:0:0:0:ffff:", 0, 15)) {
            String tail = s.substring(15);
            if (looksLikeIpv4(tail)) return tail;
        }

        return s;
    }

    /**
     * Quick syntactic check: 4 dot-separated octets in 0-255. We
     * deliberately don't use InetAddress.getByName here — it'd do a
     * reverse-DNS lookup for non-numeric input which is expensive and
     * a sidechannel on the request hot path.
     */
    private static boolean looksLikeIpv4(String s) {
        if (s == null || s.isEmpty()) return false;
        int dots = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '.') dots++;
            else if (c < '0' || c > '9') return false;
        }
        if (dots != 3) return false;
        for (String part : s.split("\\.", -1)) {
            if (part.isEmpty() || part.length() > 3) return false;
            try {
                int n = Integer.parseInt(part);
                if (n < 0 || n > 255) return false;
            } catch (NumberFormatException e) {
                return false;
            }
        }
        return true;
    }

    /**
     * True when the IP is a loopback address — 127.0.0.0/8 or ::1.
     * Useful for audit code that wants to skip self-tests or for
     * security events that should be tagged "internal" vs "external".
     * Returns false on null / unparseable input rather than throwing.
     */
    public static boolean isLoopback(String ip) {
        if (ip == null || ip.isEmpty()) return false;
        try {
            return InetAddress.getByName(ip).isLoopbackAddress();
        } catch (UnknownHostException e) {
            return false;
        }
    }
}
