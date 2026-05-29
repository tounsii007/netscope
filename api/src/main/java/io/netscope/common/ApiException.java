package io.netscope.common;

import org.slf4j.Logger;
import org.springframework.http.HttpStatus;

import java.util.UUID;

public class ApiException extends RuntimeException {
    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() { return status; }

    public static ApiException badRequest(String m) { return new ApiException(HttpStatus.BAD_REQUEST, m); }
    public static ApiException forbidden(String m) { return new ApiException(HttpStatus.FORBIDDEN, m); }
    public static ApiException tooMany(String m) { return new ApiException(HttpStatus.TOO_MANY_REQUESTS, m); }
    public static ApiException notFound(String m) { return new ApiException(HttpStatus.NOT_FOUND, m); }

    /**
     * Produce a sanitised 400-class exception that hides the underlying
     * cause from the client but logs the full stack server-side under a
     * correlation ID. Mirrors {@link io.netscope.billing.BillingController}'s
     * Stripe-failure pattern so every controller that catches a raw
     * library / network exception can surface it the same way.
     *
     * The leaked-bug class this prevents:
     *   • RIPE / crt.sh / Cloudflare CDN errors that include the upstream
     *     server's IP or hostname in the message
     *   • RestClientException + JdbcSQLException + java.net errors
     *     whose getMessage() embeds connection strings, file paths, or
     *     internal hostnames
     *   • NullPointerExceptions inside a downstream library whose
     *     message reveals which library version is in use
     *
     * Usage:
     * <pre>
     *   try { ... } catch (Exception e) {
     *       throw ApiException.sanitizedFailure(log, "RIPE lookup failed", e);
     *   }
     * </pre>
     */
    public static ApiException sanitizedFailure(Logger log, String publicMessage, Throwable cause) {
        String correlationId = UUID.randomUUID().toString();
        log.error("[{}] {}", correlationId, publicMessage, cause);
        return new ApiException(HttpStatus.BAD_REQUEST,
            publicMessage + " (ref: " + correlationId + ")");
    }
}
