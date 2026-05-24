package io.netscope.config;

import io.netscope.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.*;

/**
 * CORS configuration adversarial tests.
 *
 * Found by audit: an empty/missing {@code netscope.cors.allowed-origins} value
 * makes Spring's CORS layer accept ANY origin (wildcard fallback). That means
 * any third-party site could call our API with the user's session attached,
 * voiding the entire same-origin policy.
 *
 * Fix: fail-fast at boot if the env is empty or contains only "*".
 */
class CorsConfigTest {

    private SecurityConfig configWithOrigins(String value) {
        SecurityConfig c = new SecurityConfig();
        ReflectionTestUtils.setField(c, "allowedOrigins", value);
        return c;
    }

    @Test void empty_allowed_origins_fails_fast_at_boot() {
        SecurityConfig c = configWithOrigins("");
        assertThatThrownBy(c::corsConfigurationSource)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("must be set");
    }

    @Test void null_allowed_origins_fails_fast_at_boot() {
        SecurityConfig c = configWithOrigins(null);
        assertThatThrownBy(c::corsConfigurationSource)
            .isInstanceOf(IllegalStateException.class);
    }

    @Test void whitespace_only_allowed_origins_fails_fast() {
        SecurityConfig c = configWithOrigins("   ");
        assertThatThrownBy(c::corsConfigurationSource)
            .isInstanceOf(IllegalStateException.class);
    }

    @Test void wildcard_origin_is_explicitly_rejected() {
        SecurityConfig c = configWithOrigins("*");
        assertThatThrownBy(c::corsConfigurationSource)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("must not contain '*'");
    }

    @Test void wildcard_mixed_with_real_origin_still_rejected() {
        SecurityConfig c = configWithOrigins("https://app.netscope.io,*");
        assertThatThrownBy(c::corsConfigurationSource)
            .isInstanceOf(IllegalStateException.class);
    }

    @Test void single_origin_is_accepted_and_normalized() {
        SecurityConfig c = configWithOrigins("https://app.netscope.io");
        assertThatCode(c::corsConfigurationSource).doesNotThrowAnyException();
    }

    @Test void multiple_origins_with_whitespace_are_trimmed() {
        SecurityConfig c = configWithOrigins(
            " https://app.netscope.io , https://staging.netscope.io ,https://admin.netscope.io ");
        assertThatCode(c::corsConfigurationSource).doesNotThrowAnyException();
    }

    @Test void list_with_only_empty_entries_fails() {
        SecurityConfig c = configWithOrigins(",,,,");
        assertThatThrownBy(c::corsConfigurationSource)
            .isInstanceOf(IllegalStateException.class);
    }

    /* ── shape validation (iter 32) ──────────────────────────────── */

    @Test void scheme_less_origin_fails_fast() {
        // "app.netscope.io" without scheme is a classic copy-paste typo;
        // Spring's CORS would silently miss the comparison.
        SecurityConfig c = configWithOrigins("app.netscope.io");
        assertThatThrownBy(c::corsConfigurationSource)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("must start with http:// or https://");
    }

    @Test void trailing_slash_origin_fails_fast() {
        // CORS spec compares origins as scheme + host + port; a trailing
        // slash means we'd never match the browser's actual Origin header.
        SecurityConfig c = configWithOrigins("https://app.netscope.io/");
        assertThatThrownBy(c::corsConfigurationSource)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("trailing slash");
    }

    @Test void ftp_or_other_schemes_fail_fast() {
        SecurityConfig c = configWithOrigins("ftp://example.com");
        assertThatThrownBy(c::corsConfigurationSource)
            .isInstanceOf(IllegalStateException.class);
    }

    @Test void http_origin_for_dev_is_accepted() {
        // Local dev still wants http://localhost:3000 etc.
        SecurityConfig c = configWithOrigins("http://localhost:3000");
        assertThatCode(c::corsConfigurationSource).doesNotThrowAnyException();
    }

    @Test void exposed_headers_include_X_Request_Id_for_support_tickets() {
        SecurityConfig c = configWithOrigins("https://app.netscope.io");
        var src = c.corsConfigurationSource();
        var cfg = ((org.springframework.web.cors.UrlBasedCorsConfigurationSource) src)
            .getCorsConfigurations().get("/api/**");
        assertThat(cfg.getExposedHeaders())
            .as("X-Request-Id must be in Access-Control-Expose-Headers so the SPA can read it")
            .contains("X-Request-Id");
    }

    @Test void allowed_headers_include_traceparent_for_distributed_tracing() {
        SecurityConfig c = configWithOrigins("https://app.netscope.io");
        var src = c.corsConfigurationSource();
        var cfg = ((org.springframework.web.cors.UrlBasedCorsConfigurationSource) src)
            .getCorsConfigurations().get("/api/**");
        assertThat(cfg.getAllowedHeaders())
            .as("traceparent must be allow-listed so frontend can propagate trace context")
            .contains("traceparent", "X-Request-Id");
    }
}
