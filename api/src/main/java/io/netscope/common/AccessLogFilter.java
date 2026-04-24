package io.netscope.common;

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

    private static String fullPath(HttpServletRequest req) {
        String q = req.getQueryString();
        return q != null ? req.getRequestURI() + "?" + q : req.getRequestURI();
    }

    private static String clientIp(HttpServletRequest req) {
        String fwd = req.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        return req.getRemoteAddr();
    }

    /** Collapse whitespace in User-Agent to keep log lines single-line */
    private static String sanitize(String ua) {
        if (ua == null || ua.isBlank()) return "-";
        return ua.replaceAll("\\s+", " ").trim();
    }
}
