package io.netscope.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Global exception handler.
 *
 * Security philosophy:
 *   • {@link ApiException} carries an explicit, deliberately-curated message
 *     written for end-users (e.g. "invalid IP", "rate limit exceeded"). Safe
 *     to surface verbatim.
 *   • {@link IllegalArgumentException} typically comes from validation paths
 *     that already produce safe messages.
 *   • EVERY OTHER exception (NullPointerException, JdbcSQLException,
 *     OutOfMemoryError, JsonProcessingException, RestClientException, …)
 *     can leak stack frames, SQL fragments, internal hostnames, file paths,
 *     credentials embedded in connection strings, etc. NEVER echo their
 *     {@code getMessage()} back to the client. Instead emit a stable
 *     "Internal Server Error" with a correlation ID, then log the real
 *     exception server-side so operators can find it via the ID.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(Map.of(
            "error", ex.getStatus().getReasonPhrase(),
            "message", ex.getMessage(),
            "timestamp", Instant.now().toString()
        ));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegal(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Bad Request",
            "message", ex.getMessage() == null ? "invalid request" : ex.getMessage(),
            "timestamp", Instant.now().toString()
        ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception ex) {
        // Generate a correlation ID so operators can find the full stack
        // trace in logs. Surface that ID to the user — never the raw message.
        String correlationId = UUID.randomUUID().toString();
        log.error("[{}] Unhandled exception in request handler", correlationId, ex);
        return ResponseEntity.internalServerError().body(Map.of(
            "error", "Internal Server Error",
            "message", "An internal error occurred. Reference: " + correlationId,
            "correlationId", correlationId,
            "timestamp", Instant.now().toString()
        ));
    }
}
