package io.netscope.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.util.Map;

/**
 * Centralised 429 response emitter so every rate-limit tier writes the
 * same header set and JSON envelope. SPA error handlers can branch on
 * {@code body.error} without parsing free-text.
 *
 * Output:
 *   • Status 429
 *   • {@code Retry-After}        — legacy clients
 *   • {@code X-RateLimit-Limit / Remaining / Reset} — modern clients
 *   • JSON body {@code {"error":"Too Many Requests","message":"<reason>"}}
 */
public final class TooManyRequestsResponse {
    private TooManyRequestsResponse() {}

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void write(HttpServletResponse res, int limit,
                             long resetEpochSec, String reason) throws IOException {
        long retryAfterSec = Math.max(1L, resetEpochSec - (System.currentTimeMillis() / 1000L));
        res.setStatus(429);
        res.setHeader("Retry-After",         String.valueOf(retryAfterSec));
        res.setHeader("X-RateLimit-Limit",   String.valueOf(limit));
        res.setHeader("X-RateLimit-Remaining","0");
        res.setHeader("X-RateLimit-Reset",   String.valueOf(resetEpochSec));
        res.setContentType("application/json");
        // Jackson-serialise so any reason text with quotes, backslashes,
        // control chars, or Unicode is escaped correctly. Hand-concat
        // would produce invalid JSON the moment a reason contains a ".
        MAPPER.writeValue(res.getWriter(),
            Map.of("error", "Too Many Requests", "message", reason));
    }
}
