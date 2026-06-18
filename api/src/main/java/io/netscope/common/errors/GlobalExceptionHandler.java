package io.netscope.common.errors;

import io.netscope.common.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

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
 *
 * Response shape
 * ──────────────
 * Every body is a JSON object with a STABLE set of keys so clients can
 * deserialize without surprise:
 *
 *   {
 *     "error":         "<HTTP reason phrase>",
 *     "code":          "<ErrorCode enum name, e.g. INVALID_TARGET>",
 *     "message":       "<safe end-user message>",
 *     "path":          "<request path, e.g. /api/v1/dns/lookup>",
 *     "requestId":     "<8-byte hex from RequestIdFilter, also in X-Request-Id>",
 *     "correlationId": "<only on 5xx — a fresh UUID for log triage>",
 *     "timestamp":     "<ISO-8601 instant>"
 *   }
 *
 * Frontends can branch on `code` (stable) and show `message` (human).
 * `path` + `requestId` give support engineers everything they need to
 * grep the log files for the failing request.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApi(ApiException ex, HttpServletRequest req) {
        return ResponseEntity.status(ex.getStatus()).body(
            body(ex.getStatus(), ex.getCode(), ex.getMessage(), req, null)
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegal(
            IllegalArgumentException ex, HttpServletRequest req) {
        return ResponseEntity.badRequest().body(
            body(HttpStatus.BAD_REQUEST, ApiException.ErrorCode.INVALID_INPUT,
                 safeOr(ex.getMessage(), "invalid request"), req, null)
        );
    }

    /**
     * Bean-Validation failure on a {@code @Valid @RequestBody} (e.g. invalid
     * email syntax, blank required field, out-of-range number). The message
     * comes from the validation annotation and is end-user-safe.
     *
     * Without this handler Spring would let the exception fall through to
     * {@link #handleOther(Exception, HttpServletRequest)} and the user
     * would see a confusing "Internal Server Error" with a correlation ID
     * for what is in fact a trivial input mistake.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleBodyValidation(
            MethodArgumentNotValidException ex, HttpServletRequest req) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(GlobalExceptionHandler::fieldErrorMessage)
            .collect(Collectors.joining("; "));
        if (message.isBlank()) message = "validation failed";
        return ResponseEntity.badRequest().body(
            body(HttpStatus.BAD_REQUEST, ApiException.ErrorCode.INVALID_INPUT, message, req, null)
        );
    }

    private static String fieldErrorMessage(FieldError fe) {
        String field = fe.getField();
        String msg = fe.getDefaultMessage();
        return field + ": " + (msg == null ? "invalid" : msg);
    }

    /** Validation on a query parameter or path variable (no @RequestBody). */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConstraint(
            ConstraintViolationException ex, HttpServletRequest req) {
        String message = ex.getConstraintViolations().stream()
            .map(v -> v.getPropertyPath() + ": " + v.getMessage())
            .collect(Collectors.joining("; "));
        if (message.isBlank()) message = "validation failed";
        return ResponseEntity.badRequest().body(
            body(HttpStatus.BAD_REQUEST, ApiException.ErrorCode.INVALID_INPUT, message, req, null)
        );
    }

    /** Malformed JSON body — also a 400, never a 500. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnparseableBody(
            HttpMessageNotReadableException ex, HttpServletRequest req) {
        return ResponseEntity.badRequest().body(
            body(HttpStatus.BAD_REQUEST, ApiException.ErrorCode.INVALID_INPUT,
                 "request body is malformed JSON", req, null)
        );
    }

    /** Wrong type on a path variable / query parameter (e.g. ?port=abc). */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex, HttpServletRequest req) {
        return ResponseEntity.badRequest().body(
            body(HttpStatus.BAD_REQUEST, ApiException.ErrorCode.INVALID_INPUT,
                 ex.getName() + ": invalid value", req, null)
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception ex, HttpServletRequest req) {
        // Generate a correlation ID so operators can find the full stack
        // trace in logs. Surface that ID to the user — never the raw message.
        String correlationId = UUID.randomUUID().toString();
        log.error("[{}] Unhandled exception in request handler", correlationId, ex);
        return ResponseEntity.internalServerError().body(
            body(HttpStatus.INTERNAL_SERVER_ERROR, ApiException.ErrorCode.GENERIC,
                 "An internal error occurred. Reference: " + correlationId, req, correlationId)
        );
    }

    /* ── helpers ─────────────────────────────────────────────────── */

    /**
     * Build the canonical response body. Uses a {@link LinkedHashMap} so
     * the JSON keys come out in a stable, human-friendly order
     * (error → code → message → path → requestId → timestamp).
     */
    private static Map<String, Object> body(
            HttpStatus status,
            ApiException.ErrorCode code,
            String message,
            HttpServletRequest req,
            String correlationId) {
        Map<String, Object> m = new LinkedHashMap<>(8);
        m.put("error", status.getReasonPhrase());
        m.put("code", code.name());
        m.put("message", message);
        if (req != null) {
            // getRequestURI is the path; never include query string (could
            // contain user secrets that the request itself was failing to
            // validate, e.g. ?email=secret@example.com on a 400).
            m.put("path", req.getRequestURI());
        }
        // RequestIdFilter populates the MDC at HIGHEST_PRECEDENCE so this
        // is always set for requests that reached a controller. Falls back
        // to "unknown" only for the rare error caught before the filter.
        String requestId = MDC.get(RequestIdFilter.MDC_KEY);
        m.put("requestId", requestId == null ? "unknown" : requestId);
        if (correlationId != null) m.put("correlationId", correlationId);
        m.put("timestamp", Instant.now().toString());
        return m;
    }

    private static String safeOr(String s, String fallback) {
        return (s == null || s.isBlank()) ? fallback : s;
    }
}
