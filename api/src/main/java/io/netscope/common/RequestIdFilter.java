package io.netscope.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.regex.Pattern;

/**
 * Stamps every inbound request with a stable correlation id and makes
 * it available to every downstream log line via SLF4J's MDC.
 *
 * Operational value
 * ─────────────────
 * Without a request id, a single user-reported failure ("the lookup
 * 500'd") forces an engineer to grep the timestamp window across all
 * five rotating log files (server / error / security / access /
 * webhook) and triangulate by IP + path — slow and brittle. With one
 * id flowing through every log line we can `grep "rid=abc123"` once
 * and reconstruct the full request trace, including any downstream
 * resilience4j circuit-breaker events and the Stripe webhook follow-up
 * if the request hit billing.
 *
 * Security properties
 * ───────────────────
 * The id is also surfaced to the client via `X-Request-Id` so users
 * can quote it when filing a support ticket — but we ONLY trust an
 * inbound `X-Request-Id` if it is a syntactically clean 8-64 char
 * token. A malicious client could otherwise inject log-line
 * separators (`\n`, ANSI escapes, `]`) and forge fake log entries
 * inside our own log files (log injection — OWASP A09). The strict
 * pattern below blocks every byte that could be interpreted as a
 * logback delimiter or terminal escape.
 *
 * Ordering
 * ────────
 * Runs at HIGHEST_PRECEDENCE so the MDC is set BEFORE the rate-limit
 * filter, the API-key filter, or any controller writes a log line.
 * Cleared in a finally block to avoid bleeding the id into the next
 * request that the servlet container's thread pool reuses.
 */
@Component
public class RequestIdFilter extends OncePerRequestFilter implements Ordered {

    public static final String MDC_KEY = "requestId";
    public static final String HEADER  = "X-Request-Id";

    /**
     * Allowed characters in a client-supplied request id. ULID, UUID,
     * hex digests and most opaque trace ids fit in this set. Anything
     * else is dropped and we generate our own — preventing newline /
     * ANSI / quote injection into the log files.
     */
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9_.\\-]{8,64}$");

    /** ThreadLocal SecureRandom — cheap, contention-free across pods. */
    private static final ThreadLocal<SecureRandom> RANDOM =
        ThreadLocal.withInitial(SecureRandom::new);

    @Override
    protected void doFilterInternal(
            HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        String inbound = req.getHeader(HEADER);
        String id;
        if (inbound != null && SAFE_ID.matcher(inbound).matches()) {
            // Trust the upstream id only when it passes the pattern.
            // We deliberately do NOT trim or normalise — the inbound
            // header is echoed verbatim if it was clean, otherwise
            // replaced entirely. Half-measures invite bypasses.
            id = inbound;
        } else {
            id = generate();
        }

        MDC.put(MDC_KEY, id);
        // Echo to the client BEFORE the chain runs so even a 500 carries
        // the header. Adding it after chain.doFilter would miss the
        // response-already-committed window.
        res.setHeader(HEADER, id);
        try {
            chain.doFilter(req, res);
        } finally {
            // CRITICAL: clear the MDC even on exception. Tomcat reuses
            // request threads — a leftover id would mis-attribute the
            // NEXT request's log lines to the previous user.
            MDC.remove(MDC_KEY);
        }
    }

    /**
     * 16-hex-char (8-byte) request id. SecureRandom gives a 64-bit
     * collision space per second per pod which is more than enough for
     * tracing — the id only needs to be unique within the retention
     * window of the log files (30 days for server, 365 for security).
     * 8 bytes keeps it short enough to grep comfortably.
     */
    private static String generate() {
        byte[] buf = new byte[8];
        RANDOM.get().nextBytes(buf);
        StringBuilder sb = new StringBuilder(16);
        for (byte b : buf) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    /**
     * Highest precedence ensures the MDC is populated before every
     * other servlet filter runs — RateLimitFilter, ApiKeyFilter and
     * any third-party filter will all see the correlation id in their
     * own log output without needing to plumb it manually.
     */
    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
