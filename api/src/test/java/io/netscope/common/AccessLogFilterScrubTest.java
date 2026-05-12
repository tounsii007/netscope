package io.netscope.common;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests the access-log query-string scrubber. Any parameter name
 * that looks like a credential must have its VALUE redacted before
 * the line lands in access.log.
 */
class AccessLogFilterScrubTest {

    @ParameterizedTest
    @CsvSource(delimiterString = "||", value = {
        // input || expected
        "token=abc123          || token=[REDACTED]",
        "code=oauth_callback   || code=[REDACTED]",
        "signature=hmac_xyz    || signature=[REDACTED]",
        "session_id=sess_42    || session_id=[REDACTED]",
        "api_key=xxx           || api_key=[REDACTED]",
        "apikey=XXX            || apikey=[REDACTED]",
        "password=hunter2      || password=[REDACTED]",
        "access_token=eyJa...  || access_token=[REDACTED]",
        "TOKEN=mixed_case      || TOKEN=[REDACTED]",
        "priceId=price_abc     || priceId=[REDACTED]",
        "price_id=price_xyz    || price_id=[REDACTED]"
    })
    void redactsSensitiveParam(String input, String expected) {
        assertThat(AccessLogFilter.scrubQuery(input)).isEqualTo(expected);
    }

    @Test void preservesNonSensitiveParams() {
        // Diagnostics parameters like ?type=, ?port=, ?host= are
        // useful in access logs and must remain visible.
        assertThat(AccessLogFilter.scrubQuery("type=A&port=443"))
            .isEqualTo("type=A&port=443");
    }

    @Test void mixedSensitiveAndNonSensitive() {
        assertThat(AccessLogFilter.scrubQuery("type=A&token=secret&port=443"))
            .isEqualTo("type=A&token=[REDACTED]&port=443");
    }

    @Test void preservesBareFlags() {
        // ?verbose with no = is kept as-is.
        assertThat(AccessLogFilter.scrubQuery("verbose&type=A"))
            .isEqualTo("verbose&type=A");
    }

    @Test void emptyStringRoundTrips() {
        assertThat(AccessLogFilter.scrubQuery("")).isEmpty();
    }

    @Test void preservesEqualsInValue() {
        // Real URLs sometimes have "=" inside a base64 or JSON-payload
        // value. We must only split on the FIRST "=" so the rest of
        // the value is preserved correctly even though we replace it.
        assertThat(AccessLogFilter.scrubQuery("token=base64==&type=A"))
            .isEqualTo("token=[REDACTED]&type=A");
        assertThat(AccessLogFilter.scrubQuery("type=A==&port=443"))
            .isEqualTo("type=A==&port=443");
    }
}
