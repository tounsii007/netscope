package io.netscope.common.security;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Single source of truth for "what's the client's IP address?".
 *
 * Several code paths used to read \`X-Forwarded-For\` directly from the
 * request, take the first hop, and treat that as the client. That's
 * spoofable per-request — an attacker just sets the header to anything
 * and the application attributes the event / cache entry / audit row
 * to the spoofed source.
 *
 * The correct approach for this stack: trust Tomcat's RemoteIpValve
 * (Spring Boot enables it via \`server.forward-headers-strategy=native\`)
 * to validate XFF against a known proxy allow-list and rewrite
 * \`req.getRemoteAddr()\`. We then read \`getRemoteAddr()\` directly and
 * stop touching the raw header.
 *
 * If RemoteIpValve isn't configured (single-instance Docker behind no
 * proxy), \`getRemoteAddr()\` still returns the TCP source IP, which is
 * the truthful client. The behaviour degrades safely either way.
 */
public final class ClientIpResolver {
    private ClientIpResolver() {}

    /**
     * Return the validated client IP, or {@code null} if the request is null.
     * Never returns the raw {@code X-Forwarded-For} value — Tomcat's
     * RemoteIpValve has already done the trusted-proxy check and stored
     * the result on the request itself.
     */
    public static String clientIp(HttpServletRequest req) {
        return req == null ? null : req.getRemoteAddr();
    }
}
