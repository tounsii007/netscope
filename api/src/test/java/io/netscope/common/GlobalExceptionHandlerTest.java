package io.netscope.common;
import io.netscope.common.errors.ApiException;

import org.junit.jupiter.api.Test;
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

    @Test void api_exception_message_is_passed_through_verbatim() {
        ApiException ex = ApiException.badRequest("invalid IP");
        ResponseEntity<Map<String, Object>> r = handler.handleApi(ex);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody()).containsEntry("message", "invalid IP");
        assertThat(r.getBody()).containsEntry("error", "Bad Request");
    }

    @Test void illegal_argument_returns_400_with_message() {
        ResponseEntity<Map<String, Object>> r =
            handler.handleIllegal(new IllegalArgumentException("port out of range"));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody()).containsEntry("message", "port out of range");
    }

    @Test void illegal_argument_with_null_message_falls_back_to_generic() {
        ResponseEntity<Map<String, Object>> r =
            handler.handleIllegal(new IllegalArgumentException((String) null));
        assertThat(r.getBody()).containsEntry("message", "invalid request");
    }

    /* ─── information disclosure guards ─────────────────────────────────── */

    @Test void other_exception_does_NOT_leak_SQL_fragment_in_response() {
        SQLException sql = new SQLException(
            "ERROR: column \"secret_token\" does not exist [SQLSTATE: 42703]\n" +
            "Hint: jdbc:postgresql://internal-db.cluster.local:5432/netscope_prod"
        );
        ResponseEntity<Map<String, Object>> r = handler.handleOther(sql);

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
        ResponseEntity<Map<String, Object>> r = handler.handleOther(npe);
        String msg = (String) r.getBody().get("message");
        assertThat(msg)
            .doesNotContain("User.getEmail")
            .doesNotContain("this.user");
    }

    @Test void other_exception_does_NOT_leak_credentials_in_message() {
        RuntimeException ex = new RuntimeException(
            "auth failed for user=admin password=Tr0ub4dor3 against ldaps://intranet.example/");
        ResponseEntity<Map<String, Object>> r = handler.handleOther(ex);
        String msg = (String) r.getBody().get("message");
        assertThat(msg)
            .doesNotContain("Tr0ub4dor3")
            .doesNotContain("admin")
            .doesNotContain("ldaps");
    }

    @Test void other_exception_returns_correlation_id_for_log_lookup() {
        ResponseEntity<Map<String, Object>> r = handler.handleOther(new RuntimeException("boom"));
        Map<String, Object> body = r.getBody();
        assertThat(body).containsKey("correlationId");
        String id = (String) body.get("correlationId");
        // UUID v4 format
        assertThat(id).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
        // Same ID is referenced in the user-facing message
        assertThat((String) body.get("message")).contains(id);
    }

    @Test void each_exception_gets_a_DIFFERENT_correlation_id() {
        String id1 = (String) handler.handleOther(new RuntimeException("a")).getBody().get("correlationId");
        String id2 = (String) handler.handleOther(new RuntimeException("a")).getBody().get("correlationId");
        assertThat(id1).isNotEqualTo(id2);
    }

    @Test void other_exception_returns_500_status() {
        ResponseEntity<Map<String, Object>> r = handler.handleOther(new RuntimeException("x"));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
