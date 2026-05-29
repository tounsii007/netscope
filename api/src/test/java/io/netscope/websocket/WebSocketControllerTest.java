package io.netscope.websocket;

import io.netscope.common.ApiException;
import io.netscope.common.TargetValidator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WebSocketControllerTest {

    private final WebSocketController ctrl =
        new WebSocketController(new TargetValidator(),
            new io.netscope.common.ToolMetrics(
                new io.micrometer.core.instrument.simple.SimpleMeterRegistry()));

    @Test void rejects_http_scheme() {
        assertThatThrownBy(() -> ctrl.probe("https://example.com", null))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("ws://");
    }

    @Test void rejects_url_without_scheme() {
        assertThatThrownBy(() -> ctrl.probe("example.com", null))
            .isInstanceOf(ApiException.class);
    }

    @Test void rejects_url_pointing_at_loopback() {
        assertThatThrownBy(() -> ctrl.probe("wss://127.0.0.1/socket", null))
            .isInstanceOf(ApiException.class);
    }

    @Test void rejects_url_pointing_at_cloud_metadata() {
        assertThatThrownBy(() -> ctrl.probe("ws://169.254.169.254/latest", null))
            .isInstanceOf(ApiException.class);
    }

    @Test void rejects_subprotocol_with_invalid_chars() {
        // The subprotocol regex runs BEFORE parseAndValidate(url), so this
        // test reaches the rejection without paying for a DNS round-trip.
        // That matters for offline CI runners where DNS resolution would
        // otherwise mask the subprotocol-validation path entirely.
        assertThatThrownBy(() -> ctrl.probe("wss://echo.websocket.events", "bad protocol"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("subprotocol");
    }

    @Test void rejects_malformed_url() {
        assertThatThrownBy(() -> ctrl.probe("not a url", null))
            .isInstanceOf(ApiException.class);
    }

    /* ─── subprotocol-edge cases ──────────────────────────────────────── */

    @Test void accepts_subprotocol_with_legal_special_chars() {
        // Sec-WebSocket-Protocol per RFC 6455 §11.8 allows tokens that
        // contain '+', ',', '/', '-', '.', '_' — the regex must keep
        // matching after future changes.
        // We assert ApiException is NOT raised on the regex path; the
        // DNS lookup that follows may throw in offline test sandboxes,
        // but the failure mode of THAT differs from "invalid
        // subprotocol token".
        try {
            ctrl.probe("wss://echo.websocket.events", "mqtt-v3.1.1+sha256/auth.tag");
        } catch (ApiException e) {
            // Acceptable: DNS-resolution-based 400 ("could not resolve")
            // or 403 ("reserved"). UNACCEPTABLE: subprotocol-regex 400.
            if (e.getMessage() != null && e.getMessage().contains("subprotocol")) {
                throw new AssertionError(
                    "Subprotocol containing legal RFC 6455 token characters should not be rejected");
            }
        }
    }

    @Test void rejects_subprotocol_over_128_char_cap() {
        // The regex caps at 128 chars to keep the Sec-WebSocket-Protocol
        // header reasonable. 200-char input must trip.
        assertThatThrownBy(() -> ctrl.probe("wss://echo.websocket.events", "a".repeat(200)))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("subprotocol");
    }

    @Test void rejects_subprotocol_with_semicolon_injection_attempt() {
        // Defensive — an attacker may try to splice a second header via
        // a CRLF or semicolon. Our regex character class excludes both;
        // confirm the rejection.
        assertThatThrownBy(() -> ctrl.probe("wss://echo.websocket.events", "mqtt;evil"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("subprotocol");
        assertThatThrownBy(() -> ctrl.probe("wss://echo.websocket.events", "mqtt\r\nX-Evil: 1"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("subprotocol");
    }
}
