package io.netscope.websocket;

import io.netscope.common.ApiException;
import io.netscope.common.TargetValidator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WebSocketControllerTest {

    private final WebSocketController ctrl =
        new WebSocketController(new TargetValidator());

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
}
