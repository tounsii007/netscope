package io.netscope.doh;

import io.netscope.common.errors.ApiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DohControllerTest {

    // Same rationale as DkimControllerTest — input-validation tests never
    // dispatch to the executor, so any ExecutorService stub works.
    private final DohController ctrl =
        new DohController(
            java.util.concurrent.Executors.newSingleThreadExecutor(),
            new io.netscope.common.observability.ToolMetrics(
                new io.micrometer.core.instrument.simple.SimpleMeterRegistry()));

    @Test void rejects_empty_domain() {
        assertThatThrownBy(() -> ctrl.probe("", "A"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid domain");
    }

    @Test void rejects_domain_with_scheme() {
        assertThatThrownBy(() -> ctrl.probe("https://example.com", "A"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid domain");
    }

    @Test void rejects_unsupported_record_type() {
        // ANY queries are spammy and most resolvers refuse them — keep
        // the supported set explicit so misuse fails fast.
        assertThatThrownBy(() -> ctrl.probe("example.com", "ANY"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("unsupported");
    }

    @Test void rejects_record_type_with_injection_attempt() {
        assertThatThrownBy(() -> ctrl.probe("example.com", "A; DROP"))
            .isInstanceOf(ApiException.class);
    }

    /* ─── input-normalisation edges ──────────────────────────────────── */

    @Test void rejects_domain_longer_than_label_cap() {
        // 254 chars violates DNS spec and most upstream resolvers will
        // refuse the query — reject early. Uses the .invalid TLD so
        // there's no path to actual DNS even if validation regressed.
        String tooLong = "a".repeat(254) + ".invalid";
        assertThatThrownBy(() -> ctrl.probe(tooLong, "A"))
            .isInstanceOf(ApiException.class);
    }

    @Test void rejects_double_dot_in_domain() {
        // Double-dot in DNS query names is invalid per RFC 1035 (zero-
        // length label) — the regex must reject it before reaching
        // the parallel probe.
        assertThatThrownBy(() -> ctrl.probe("foo..example.invalid", "A"))
            .isInstanceOf(ApiException.class);
    }
}
