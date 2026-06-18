package io.netscope.common;
import io.netscope.common.errors.ApiException;
import io.netscope.common.errors.GlobalExceptionHandler;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.sql.SQLException;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Adversarial tests for {@link GlobalExceptionHandler}.
 *
 * Hunting for information disclosure:
 *   • Database errors must NEVER leak SQL fragments, table names, connection
 *     strings or stack frames to the client.
 *   • NullPointerException must not echo back the offending field name.
 *   • A correlation ID must be returned so operators can find the real
 *     exception in logs.
 *   • ApiException messages (curated, end-user-safe) ARE allowed through.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    /**
     * Tiny stub used by every test. We don't exercise the request body
     * itself — we just need a non-null instance so the path-extraction
     * branch inside the handler can read getRequestURI(). Mockito returns
     * "/test" for it; callers that need a specific path can override.
     */
    private static HttpServletRequest req() {
        HttpServletRequest r = Mockito.mock(HttpServletRequest.class);
        Mockito.when(r.getRequestURI()).thenReturn("/test");
        return r;
    }

    @Test void api_exception_message_is_passed_through_verbatim() {
        ApiException ex = ApiException.badRequest("invalid IP");
        ResponseEntity<Map<String, Object>> r = handler.handleApi(ex, req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody()).containsEntry("message", "invalid IP");
        assertThat(r.getBody()).containsEntry("error", "Bad Request");
        // Stable machine-readable code accompanies the human message.
        assertThat(r.getBody()).containsEntry("code", "INVALID_INPUT");
    }

    @Test void api_exception_with_custom_code_is_preserved() {
        ApiException ex = ApiException.invalidTarget("localhost is not allowed");
        ResponseEntity<Map<String, Object>> r = handler.handleApi(ex, req());
        assertThat(r.getBody()).containsEntry("code", "INVALID_TARGET");
    }

    @Test void rate_limit_factory_carries_rate_limited_code() {
        ApiException ex = ApiException.tooMany("retry later");
        ResponseEntity<Map<String, Object>> r = handler.handleApi(ex, req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(r.getBody()).containsEntry("code", "RATE_LIMITED");
    }

    @Test void illegal_argument_returns_400_with_message() {
        ResponseEntity<Map<String, Object>> r =
            handler.handleIllegal(new IllegalArgumentException("port out of range"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody()).containsEntry("message", "port out of range");
        assertThat(r.getBody()).containsEntry("code", "INVALID_INPUT");
    }

    @Test void illegal_argument_with_null_message_falls_back_to_generic() {
        ResponseEntity<Map<String, Object>> r =
            handler.handleIllegal(new IllegalArgumentException((String) null), req());
        assertThat(r.getBody()).containsEntry("message", "invalid request");
    }

    @Test void every_body_includes_path_requestId_and_timestamp() {
        ResponseEntity<Map<String, Object>> r =
            handler.handleApi(ApiException.badRequest("x"), req());
        assertThat(r.getBody())
            .containsEntry("path", "/test")
            .containsKey("requestId")
            .containsKey("timestamp");
    }

    /* ─── information disclosure guards ─────────────────────────────────── */

    @Test void other_exception_does_NOT_leak_SQL_fragment_in_response() {
        SQLException sql = new SQLException(
            "ERROR: column \"secret_token\" does not exist [SQLSTATE: 42703]\n" +
            "Hint: jdbc:postgresql://internal-db.cluster.local:5432/netscope_prod"
        );
        ResponseEntity<Map<String, Object>> r = handler.handleOther(sql, req());

        Map<String, Object> body = r.getBody();
        assertThat(body).isNotNull();
        // The MESSAGE must not contain ANY part of the raw SQL message
        String msg = (String) body.get("message");
        assertThat(msg)
            .doesNotContain("secret_token")
            .doesNotContain("SQLSTATE")
            .doesNotContain("jdbc:")
            .doesNotContain("internal-db")
            .doesNotContain("netscope_prod");
        assertThat(msg).startsWith("An internal error occurred. Reference: ");
    }

    @Test void other_exception_does_NOT_leak_NPE_field_name() {
        NullPointerException npe = new NullPointerException(
            "Cannot invoke \"User.getEmail()\" because \"this.user\" is null");
        ResponseEntity<Map<String, Object>> r = handler.handleOther(npe, req());
        String msg = (String) r.getBody().get("message");
        assertThat(msg)
            .doesNotContain("User.getEmail")
            .doesNotContain("this.user");
    }

    @Test void other_exception_does_NOT_leak_credentials_in_message() {
        RuntimeException ex = new RuntimeException(
            "auth failed for user=admin password=Tr0ub4dor3 against ldaps://intranet.example/");
        ResponseEntity<Map<String, Object>> r = handler.handleOther(ex, req());
        String msg = (String) r.getBody().get("message");
        assertThat(msg)
            .doesNotContain("Tr0ub4dor3")
            .doesNotContain("admin")
            .doesNotContain("ldaps");
    }

    @Test void other_exception_returns_correlation_id_for_log_lookup() {
        ResponseEntity<Map<String, Object>> r =
            handler.handleOther(new RuntimeException("boom"), req());
        Map<String, Object> body = r.getBody();
        assertThat(body).containsKey("correlationId");
        String id = (String) body.get("correlationId");
        // UUID v4 format
        assertThat(id).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
        // Same ID is referenced in the user-facing message
        assertThat((String) body.get("message")).contains(id);
    }

    @Test void each_exception_gets_a_DIFFERENT_correlation_id() {
        String id1 = (String) handler.handleOther(new RuntimeException("a"), req()).getBody().get("correlationId");
        String id2 = (String) handler.handleOther(new RuntimeException("a"), req()).getBody().get("correlationId");
        assertThat(id1).isNotEqualTo(id2);
    }

    @Test void other_exception_returns_500_status() {
        ResponseEntity<Map<String, Object>> r =
            handler.handleOther(new RuntimeException("x"), req());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
