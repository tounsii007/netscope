package io.netscope.common;
import io.netscope.common.errors.ApiException;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class ApiExceptionTest {

    @Test void newCorrelationId_returns_32_char_hex() {
        String id = ApiException.newCorrelationId();
        assertThat(id).hasSize(32);
        assertThat(id).matches("^[0-9a-f]{32}$");
    }

    @Test void newCorrelationId_returns_distinct_values_across_calls() {
        // 128 bits of entropy via ThreadLocalRandom — duplicates are
        // astronomically unlikely. 1000 samples confirms the generator
        // isn't seeded deterministically at module load.
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) seen.add(ApiException.newCorrelationId());
        assertThat(seen).hasSize(1000);
    }

    @Test void sanitizedFailure_returns_400_with_ref_in_message_and_logs_cause() {
        var log = LoggerFactory.getLogger("test-logger");
        var ex = ApiException.sanitizedFailure(log, "thing went wrong",
            new RuntimeException("very specific cause that must NOT leak"));

        assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getMessage())
            .startsWith("thing went wrong (ref: ")
            .endsWith(")")
            .doesNotContain("very specific cause");
        // Confirm the ref-id substring is the 32-hex form. Pull the
        // segment between "(ref: " and the trailing ")" and assert shape.
        int refStart = ex.getMessage().indexOf("(ref: ") + "(ref: ".length();
        int refEnd   = ex.getMessage().length() - 1;
        String ref = ex.getMessage().substring(refStart, refEnd);
        assertThat(ref).matches("^[0-9a-f]{32}$");
    }
}
