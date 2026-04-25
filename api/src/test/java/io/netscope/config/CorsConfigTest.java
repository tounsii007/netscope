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
}
