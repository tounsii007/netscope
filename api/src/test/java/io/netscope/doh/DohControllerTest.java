package io.netscope.doh;

import io.netscope.common.ApiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DohControllerTest {

    private final DohController ctrl = new DohController();

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
}
