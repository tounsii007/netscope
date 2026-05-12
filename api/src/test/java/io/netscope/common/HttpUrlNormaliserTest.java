package io.netscope.common;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class HttpUrlNormaliserTest {

    @Test void passesThroughHttpScheme() {
        assertThat(HttpUrlNormaliser.ensureHttpScheme("http://example.com"))
            .isEqualTo("http://example.com");
    }

    @Test void passesThroughHttpsScheme() {
        assertThat(HttpUrlNormaliser.ensureHttpScheme("https://example.com/path?q=1"))
            .isEqualTo("https://example.com/path?q=1");
    }

    @ParameterizedTest
    @CsvSource({
        "HTTPS://example.com,             HTTPS://example.com",
        "HTTP://example.com,              HTTP://example.com",
        "Https://Foo.Example.Com,         Https://Foo.Example.Com"
    })
    void caseInsensitiveSchemeDetection(String input, String expected) {
        // The scheme detection lowercases for comparison but preserves
        // the caller's original casing in the output so downstream
        // logging is faithful.
        assertThat(HttpUrlNormaliser.ensureHttpScheme(input)).isEqualTo(expected);
    }

    @Test void prependsHttpsForBareHost() {
        assertThat(HttpUrlNormaliser.ensureHttpScheme("example.com"))
            .isEqualTo("https://example.com");
    }

    @Test void prependsHttpsForBareHostWithPath() {
        assertThat(HttpUrlNormaliser.ensureHttpScheme("example.com/admin"))
            .isEqualTo("https://example.com/admin");
    }

    /**
     * Regression for the old bug: startsWith("http") matched these
     * inputs and let them through unchanged, so URI.create("httphijack")
     * went through and produced an opaque connection failure further
     * down the pipeline.
     */
    @ParameterizedTest
    @ValueSource(strings = {
        "http",            // the bare literal
        "httpfoo://x.y",   // looks like a scheme but isn't
        "httphijack",      // arbitrary string starting with "http"
        "httpsy",          // arbitrary string starting with "http"
    })
    void prependsHttpsForFakeHttpPrefixes(String malicious) {
        assertThat(HttpUrlNormaliser.ensureHttpScheme(malicious))
            .startsWith("https://");
    }

    @Test void emptyInputPassesThroughUnchanged() {
        // Callers reject empty input upstream; the normaliser must not
        // turn "" into "https://" because that's a different malformed URL.
        assertThat(HttpUrlNormaliser.ensureHttpScheme("")).isEqualTo("");
        assertThat(HttpUrlNormaliser.ensureHttpScheme(null)).isNull();
    }
}
