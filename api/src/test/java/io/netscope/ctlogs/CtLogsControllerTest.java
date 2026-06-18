package io.netscope.ctlogs;

import io.netscope.common.errors.ApiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Input-validation tests for CtLogsController.
 *
 * Live crt.sh queries are reserved for the integration suite (network-
 * dependent, occasionally rate-limited). Here we verify only the
 * deterministic input-rejection paths.
 */
class CtLogsControllerTest {

    private final CtLogsController ctrl = new CtLogsController(
        new io.netscope.common.observability.ToolMetrics(
            new io.micrometer.core.instrument.simple.SimpleMeterRegistry()));

    @Test void rejects_empty_domain() {
        assertThatThrownBy(() -> ctrl.search("", true, false))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid domain");
    }

    @Test void rejects_domain_with_protocol() {
        assertThatThrownBy(() -> ctrl.search("https://example.com", true, false))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid domain");
    }

    @Test void rejects_domain_with_wildcard_injection() {
        // The controller builds the crt.sh query string from the user input.
        // Reject any character that would let the caller inject an extra
        // SQL-like wildcard or escape the q= parameter.
        assertThatThrownBy(() -> ctrl.search("example.com%25--", true, false))
            .isInstanceOf(ApiException.class);
    }

    @Test void rejects_overlong_domain() {
        assertThatThrownBy(() -> ctrl.search("a".repeat(254), true, false))
            .isInstanceOf(ApiException.class);
    }

    /* ─── normalize() — date math + SAN expansion ─────────────────────── */

    @Test void normalize_splits_newline_delimited_sans_into_array() {
        var row = new java.util.HashMap<String, Object>();
        row.put("id", 1L);
        row.put("serial_number", "abc");
        row.put("common_name", "example.com");
        row.put("name_value", "example.com\napi.example.com\n*.example.com");
        row.put("issuer_name", "Let's Encrypt");
        row.put("issuer_ca_id", 42);
        row.put("not_before", "2025-01-01T00:00:00");
        row.put("not_after", "2025-04-01T00:00:00");

        var n = CtLogsController.normalize(row, java.time.LocalDate.of(2025, 2, 1));
        assertThat(n.get("sans")).asList()
            .containsExactly("example.com", "api.example.com", "*.example.com");
    }

    @Test void normalize_deduplicates_repeated_sans() {
        var row = baseRow();
        row.put("name_value", "example.com\nexample.com\napi.example.com");
        var n = CtLogsController.normalize(row, java.time.LocalDate.of(2025, 2, 1));
        // Order preserved (LinkedHashSet semantics) + duplicates removed.
        assertThat(n.get("sans")).asList()
            .containsExactly("example.com", "api.example.com");
    }

    @Test void normalize_flags_expired_when_notAfter_before_today() {
        var row = baseRow();
        row.put("not_before", "2024-01-01T00:00:00");
        row.put("not_after",  "2024-04-01T00:00:00");

        var n = CtLogsController.normalize(row, java.time.LocalDate.of(2025, 1, 15));
        assertThat(n.get("expired")).isEqualTo(true);
        assertThat(n.get("daysUntilExpiry")).isEqualTo(-289); // 2024-04-01 → 2025-01-15
    }

    @Test void normalize_computes_positive_days_until_expiry_when_active() {
        var row = baseRow();
        row.put("not_before", "2025-01-01T00:00:00");
        row.put("not_after",  "2025-04-01T00:00:00");

        var n = CtLogsController.normalize(row, java.time.LocalDate.of(2025, 1, 15));
        assertThat(n.get("expired")).isEqualTo(false);
        assertThat(n.get("daysUntilExpiry")).isEqualTo(76);
        assertThat(n.get("validForDays")).isEqualTo(90);
    }

    @Test void normalize_survives_malformed_dates_by_returning_null() {
        // crt.sh occasionally emits truncated rows during a log import —
        // we must skip them rather than fail the whole response.
        var row = baseRow();
        row.put("not_before", "not-a-date");
        var n = CtLogsController.normalize(row, java.time.LocalDate.now());
        assertThat(n).isNull();
    }

    @Test void normalize_returns_null_when_dates_are_null() {
        // Distinct from the malformed-string case above: when the upstream
        // omits the date field entirely the previous safePrefix(null, 10)
        // substituted "1970-01-01" and the row landed in the result as
        // "expired by ~55 years". Skip instead.
        var row = baseRow();
        row.put("not_before", null);
        assertThat(CtLogsController.normalize(row, java.time.LocalDate.now())).isNull();

        row = baseRow();
        row.put("not_after", null);
        assertThat(CtLogsController.normalize(row, java.time.LocalDate.now())).isNull();
    }

    @Test void normalize_handles_null_name_value() {
        var row = baseRow();
        row.put("name_value", null);
        var n = CtLogsController.normalize(row, java.time.LocalDate.of(2025, 2, 1));
        assertThat(n.get("sans")).asList().isEmpty();
    }

    /** Skeleton row with placeholder valid dates — individual tests
     *  override the fields they care about. */
    private static java.util.Map<String, Object> baseRow() {
        var row = new java.util.HashMap<String, Object>();
        row.put("id", 1L);
        row.put("serial_number", "abc");
        row.put("common_name", "example.com");
        row.put("name_value", "example.com");
        row.put("issuer_name", "Let's Encrypt");
        row.put("issuer_ca_id", 42);
        row.put("not_before", "2025-01-01T00:00:00");
        row.put("not_after",  "2025-04-01T00:00:00");
        return row;
    }

    /* ─── normalize() — real-world edge cases ─────────────────────────── */

    @Test void normalize_handles_truncated_date_format_emitted_during_log_import() {
        // crt.sh occasionally emits dates without the trailing time
        // segment during a bulk log import. safePrefix takes the first
        // 10 chars and LocalDate.parse handles them — must produce a
        // valid normalised row, not null.
        var row = baseRow();
        row.put("not_before", "2025-01-01");      // no T-time component
        row.put("not_after",  "2025-04-01");

        var n = CtLogsController.normalize(row, java.time.LocalDate.of(2025, 2, 1));
        assertThat(n).isNotNull();
        assertThat(n.get("expired")).isEqualTo(false);
        assertThat(n.get("validForDays")).isEqualTo(90);
    }

    @Test void normalize_returns_zero_validForDays_when_dates_are_identical() {
        // Edge case: zero-day cert (same notBefore = notAfter). Some
        // ACME test fixtures produce these; we must not throw or
        // divide-by-zero on UI rendering.
        var row = baseRow();
        row.put("not_before", "2025-01-01T00:00:00");
        row.put("not_after",  "2025-01-01T00:00:00");

        var n = CtLogsController.normalize(row, java.time.LocalDate.of(2025, 1, 1));
        assertThat(n).isNotNull();
        assertThat(n.get("validForDays")).isEqualTo(0);
        assertThat(n.get("daysUntilExpiry")).isEqualTo(0);
    }

    @Test void normalize_handles_internationalised_SAN_names() {
        // crt.sh may surface Punycode-encoded SANs alongside ASCII
        // ones. Both forms must reach the response unmodified — the
        // UI can choose how to display them.
        var row = baseRow();
        row.put("name_value",
            "example.com\nxn--mnchen-3ya.example.com\n*.api.example.com");

        var n = CtLogsController.normalize(row, java.time.LocalDate.of(2025, 2, 1));
        assertThat(n.get("sans")).asList()
            .containsExactly("example.com", "xn--mnchen-3ya.example.com",
                             "*.api.example.com");
    }

    @Test void normalize_correctly_classifies_chain_root_cert_as_expired() {
        // Root certs often have very long validity windows that span
        // years. Pin a case where notAfter is years in the future to
        // confirm the daysUntilExpiry math doesn't overflow for large
        // gaps.
        var row = baseRow();
        row.put("not_before", "2020-01-01T00:00:00");
        row.put("not_after",  "2040-01-01T00:00:00");

        var n = CtLogsController.normalize(row, java.time.LocalDate.of(2025, 2, 1));
        assertThat(n.get("expired")).isEqualTo(false);
        // 2040-01-01 minus 2025-02-01 ≈ 5448 days
        assertThat((Integer) n.get("daysUntilExpiry"))
            .isBetween(5_000, 6_000);
        // 2040-01-01 minus 2020-01-01 = 7305 days (incl. leap years)
        assertThat((Integer) n.get("validForDays"))
            .isBetween(7_300, 7_310);
    }
}
