package io.netscope.common;
import io.netscope.common.security.ClientIpResolver;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Writes one structured line per HTTP request to the dedicated "ACCESS" logger.
 * Logback routes that logger to access.YYYY-MM-DD.log (see logback-spring.xml).
 *
 * Format (tab-separated for easy parsing / import into ELK / Loki):
 *   METHOD  path  status  latencyMs  clientIp  userAgent
 *
 * Example:
 *   GET  /api/v1/port-check  200  42  1.2.3.4  Mozilla/5.0 ...
 *
 * Health-check noise (/actuator/health) is suppressed.
 */
@Component
@Order(1)                          // run before rate-limit so we log 429s too
public class AccessLogFilter extends OncePerRequestFilter {

    /** Dedicated logger — routed to access.log by logback-spring.xml */
    private static final Logger ACCESS = LoggerFactory.getLogger("ACCESS");

    @Override
    protected void doFilterInternal(HttpServletRequest req,
                                    HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        long start = System.currentTimeMillis();
        try {
            chain.doFilter(req, res);
        } finally {
            long ms = System.currentTimeMillis() - start;
            // Skip actuator health noise
            if (!req.getRequestURI().startsWith("/actuator/health")) {
                ACCESS.trace("{}\t{}\t{}\t{}ms\t{}\t{}",
                    req.getMethod(),
                    fullPath(req),
                    res.getStatus(),
                    ms,
                    clientIp(req),
                    sanitize(req.getHeader("User-Agent")));
            }
        }
    }

    /**
     * Sensitive query-string parameter names. The VALUE of any matching
     * parameter is replaced with "[REDACTED]" in the access log so that
     * OAuth callbacks, Stripe redirect URLs, signed-URL tokens, and
     * other accidental credentials don't survive in routine logs.
     *
     * Case-insensitive. The list is intentionally broad — false
     * positives mean we lose a parameter value from the access log,
     * which is cheap; false negatives mean a credential leak, which
     * is expensive.
     */
    private static final java.util.Set<String> SENSITIVE_PARAMS = java.util.Set.of(
        "token", "code", "signature", "sig", "key", "apikey", "api_key",
        "secret", "password", "pass", "pw", "session", "session_id",
        "auth", "authorization", "bearer", "access_token", "refresh_token",
        "id_token", "client_secret", "priceid", "price_id",
        "customeremail", "customer_email"
    );

    private static String fullPath(HttpServletRequest req) {
        String q = req.getQueryString();
        if (q == null) return req.getRequestURI();
        return req.getRequestURI() + "?" + scrubQuery(q);
    }

    /**
     * Walk the raw query string, replacing the VALUE of any
     * sensitive-named parameter with "[REDACTED]" while preserving
     * key names + structure. We deliberately operate on the raw
     * string rather than the parsed parameter map so the redaction
     * shows up in the log line in the same position the value would
     * have, which makes log parsing tools and humans see the same
     * shape and notice when something was scrubbed.
     */
    static String scrubQuery(String q) {
        if (q.isEmpty()) return q;
        String[] parts = q.split("&", -1);
        StringBuilder sb = new StringBuilder(q.length());
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append('&');
            String part = parts[i];
            int eq = part.indexOf('=');
            if (eq < 0) {
                // Bare flag (e.g. ?verbose) — keep as-is.
                sb.append(part);
                continue;
            }
            String name = part.substring(0, eq);
            if (SENSITIVE_PARAMS.contains(name.toLowerCase())) {
                sb.append(name).append("=[REDACTED]");
            } else {
                sb.append(part);
            }
        }
        return sb.toString();
    }

    private static String clientIp(HttpServletRequest req) {
        return ClientIpResolver.clientIp(req);
    }

    /** Collapse whitespace in User-Agent to keep log lines single-line */
    private static String sanitize(String ua) {
        if (ua == null || ua.isBlank()) return "-";
        return ua.replaceAll("\\s+", " ").trim();
    }
}
