package io.netscope.common;
import io.netscope.common.http.HttpUrlNormaliser;
import io.netscope.common.errors.ApiException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    /* ── new corner cases (iter 22) ───────────────────────────────── */

    @Test void trimsLeadingAndTrailingWhitespace() {
        assertThat(HttpUrlNormaliser.ensureHttpScheme("   example.com   "))
            .isEqualTo("https://example.com");
        assertThat(HttpUrlNormaliser.ensureHttpScheme("\t https://e.com \n"))
            .isEqualTo("https://e.com");
    }

    @Test void whitespaceOnlyReturnsTrimmedEmpty() {
        // The trimmed-empty branch returns the empty string, not the
        // null sentinel — the contract is "don't manufacture a scheme
        // for empty input" and callers handle either flavour.
        assertThat(HttpUrlNormaliser.ensureHttpScheme("   ")).isEqualTo("");
    }

    @Test void protocolRelativeBecomesHttps() {
        assertThat(HttpUrlNormaliser.ensureHttpScheme("//example.com/foo"))
            .isEqualTo("https://example.com/foo");
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "ftp://example.com",
        "gopher://example.com",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "data:text/html,<script>",
        "ldap://internal.example/",
        "jar:file:///x.jar!/y",
    })
    void rejectsNonHttpSchemes(String input) {
        // Old code would have produced 'https://ftp://example.com' etc.
        // New behaviour: surface a 400 with a clear message.
        assertThatThrownBy(() -> HttpUrlNormaliser.ensureHttpScheme(input))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("unsupported URL scheme");
    }

    @Test void httpfooSchemeIsRejectedAsNonHttp() {
        // "httpfoo://x.y" contains "://" so the substring-based
        // detection rejects it. Previously it was misclassified as a
        // bare host and got double-prepended with https://.
        assertThatThrownBy(() -> HttpUrlNormaliser.ensureHttpScheme("httpfoo://x.y"))
            .isInstanceOf(ApiException.class);
    }

    @Test void portInBareHostIsPreservedNotMistakenForScheme() {
        // Critical: 'example.com:8080' has a colon but no '://', so
        // it must NOT trigger the unsupported-scheme rejection. A
        // naive regex on '^\\w+:' would have broken this.
        assertThat(HttpUrlNormaliser.ensureHttpScheme("example.com:8080/admin"))
            .isEqualTo("https://example.com:8080/admin");
        assertThat(HttpUrlNormaliser.ensureHttpScheme("example.com:443"))
            .isEqualTo("https://example.com:443");
    }
}
