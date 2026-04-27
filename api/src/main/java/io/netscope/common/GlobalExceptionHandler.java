package io.netscope.common;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.Instant;
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

    /**
     * Bean-Validation failure on a {@code @Valid @RequestBody} (e.g. invalid
     * email syntax, blank required field, out-of-range number). The message
     * comes from the validation annotation and is end-user-safe.
     *
     * Without this handler Spring would let the exception fall through to
     * {@link #handleOther(Exception)} and the user would see a confusing
     * "Internal Server Error" with a correlation ID for what is in fact a
     * trivial input mistake.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleBodyValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(GlobalExceptionHandler::fieldErrorMessage)
            .collect(Collectors.joining("; "));
        if (message.isBlank()) message = "validation failed";
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Bad Request",
            "message", message,
            "timestamp", Instant.now().toString()
        ));
    }

    private static String fieldErrorMessage(FieldError fe) {
        String field = fe.getField();
        String msg = fe.getDefaultMessage();
        return field + ": " + (msg == null ? "invalid" : msg);
    }

    /** Validation on a query parameter or path variable (no @RequestBody). */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConstraint(ConstraintViolationException ex) {
        String message = ex.getConstraintViolations().stream()
            .map(v -> v.getPropertyPath() + ": " + v.getMessage())
            .collect(Collectors.joining("; "));
        if (message.isBlank()) message = "validation failed";
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Bad Request",
            "message", message,
            "timestamp", Instant.now().toString()
        ));
    }

    /** Malformed JSON body — also a 400, never a 500. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnparseableBody(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Bad Request",
            "message", "request body is malformed JSON",
            "timestamp", Instant.now().toString()
        ));
    }

    /** Wrong type on a path variable / query parameter (e.g. ?port=abc). */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.badRequest().body(Map.of(
            "error", "Bad Request",
            "message", ex.getName() + ": invalid value",
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
