package io.netscope.common;

import org.springframework.http.HttpStatus;

/**
 * The single exception type controllers throw for any user-visible
 * client-error. Carries the HTTP status, a safe human-readable message,
 * and an optional stable error {@link #code} that the frontend can
 * branch on without parsing the prose.
 *
 * Why a stable code matters
 * ─────────────────────────
 * The `message` field is written for humans and will be translated /
 * reworded over time. The frontend can't rely on its exact value. A
 * machine-readable `code` ("INVALID_TARGET", "RATE_LIMITED") gives
 * client code something stable to switch on — e.g. show a "did you
 * mean…?" hint only on INVALID_TARGET, or schedule a retry only on
 * RATE_LIMITED. Defaults to {@link ErrorCode#GENERIC} when the caller
 * doesn't care.
 */
public class ApiException extends RuntimeException {

    /**
     * Stable, machine-readable identifiers for the most common API
     * failure modes. Frontends switch on these — keep names UPPER_SNAKE,
     * never rename in a backward-incompatible way.
     */
    public enum ErrorCode {
        GENERIC,
        INVALID_INPUT,
        INVALID_TARGET,
        TARGET_BLOCKED,
        RATE_LIMITED,
        NOT_FOUND,
        FORBIDDEN,
        UPSTREAM_TIMEOUT,
        UPSTREAM_ERROR,
        PAYLOAD_TOO_LARGE,
    }

    private final HttpStatus status;
    private final ErrorCode code;

    public ApiException(HttpStatus status, String message) {
        this(status, ErrorCode.GENERIC, message);
    }

    public ApiException(HttpStatus status, ErrorCode code, String message) {
        super(message);
        this.status = status;
        this.code = code == null ? ErrorCode.GENERIC : code;
    }

    public HttpStatus getStatus() { return status; }
    public ErrorCode getCode() { return code; }

    /* ── factory helpers ──────────────────────────────────────────── */

    public static ApiException badRequest(String m) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_INPUT, m);
    }
    public static ApiException invalidTarget(String m) {
        return new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_TARGET, m);
    }
    public static ApiException forbidden(String m) {
        return new ApiException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, m);
    }
    public static ApiException targetBlocked(String m) {
        return new ApiException(HttpStatus.FORBIDDEN, ErrorCode.TARGET_BLOCKED, m);
    }
    public static ApiException tooMany(String m) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, m);
    }
    public static ApiException notFound(String m) {
        return new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, m);
    }
    public static ApiException upstreamTimeout(String m) {
        return new ApiException(HttpStatus.GATEWAY_TIMEOUT, ErrorCode.UPSTREAM_TIMEOUT, m);
    }
    public static ApiException upstreamError(String m) {
        return new ApiException(HttpStatus.BAD_GATEWAY, ErrorCode.UPSTREAM_ERROR, m);
    }
    public static ApiException payloadTooLarge(String m) {
        return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.PAYLOAD_TOO_LARGE, m);
    }
}
