package io.netscope.common.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Centralised 429 response emitter so every rate-limit tier writes the
 * same header set and JSON envelope.
 *
 * The body shape mirrors {@code GlobalExceptionHandler}'s canonical error
 * envelope so SPA error handlers don't need a special branch for 429s:
 *
 *   { error, code: RATE_LIMITED, message, path, requestId, timestamp }
 *
 * Output:
 *   • Status 429
 *   • {@code Retry-After}        — legacy clients
 *   • {@code X-RateLimit-Limit / Remaining / Reset} — modern clients
 *   • Canonical JSON envelope (see above)
 */
public final class TooManyRequestsResponse {
    private TooManyRequestsResponse() {}

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void write(HttpServletRequest req, HttpServletResponse res, int limit,
                             long resetEpochSec, String reason) throws IOException {
        long retryAfterSec = Math.max(1L, resetEpochSec - (System.currentTimeMillis() / 1000L));
        res.setStatus(429);
        res.setHeader("Retry-After",         String.valueOf(retryAfterSec));
        res.setHeader("X-RateLimit-Limit",   String.valueOf(limit));
        res.setHeader("X-RateLimit-Remaining","0");
        res.setHeader("X-RateLimit-Reset",   String.valueOf(resetEpochSec));
        res.setContentType("application/json;charset=UTF-8");

        String requestId = MDC.get(RequestIdFilter.MDC_KEY);
        String path = req == null ? null : req.getRequestURI();

        // LinkedHashMap so the JSON keys come out in a stable, human-friendly
        // order matching GlobalExceptionHandler's envelope. Jackson-serialise
        // so any reason text with quotes, backslashes, control chars, or
        // Unicode is escaped correctly.
        Map<String, Object> body = new LinkedHashMap<>(6);
        body.put("error", "Too Many Requests");
        body.put("code", "RATE_LIMITED");
        body.put("message", reason);
        body.put("path", path == null ? "" : path);
        body.put("requestId", requestId == null ? "unknown" : requestId);
        body.put("timestamp", Instant.now().toString());
        MAPPER.writeValue(res.getWriter(), body);
    }
}
