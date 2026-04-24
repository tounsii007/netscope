package io.netscope.port;

import io.netscope.common.ApiException;
import io.netscope.common.TargetValidator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.ServerSocket;

import static org.assertj.core.api.Assertions.*;

class PortServiceTest {

    private final PortService service = new PortService(new TargetValidator());
    private ServerSocket listener;

    @BeforeEach void open() throws Exception {
        listener = new ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"));
    }
    @AfterEach void close() throws Exception { listener.close(); }

    @Test void loopbackTargetBlockedBySsrfGuard() {
        assertThatThrownBy(() -> service.check("127.0.0.1", listener.getLocalPort(), "tcp", 500))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("reserved");
    }

    @Test void closedPortReturnsClosed() {
        var r = service.check("1.1.1.1", 9, "tcp", 500);
        assertThat(r.open()).isFalse();
        assertThat(r.error()).isNotBlank();
    }

    @Test void commonPortsFlagPresent() {
        var req = new PortDtos.PortScanRequest("1.1.1.1", null, null, null, true);
        var result = service.scan(req);
        assertThat(result.results()).hasSize(PortService.COMMON_PORTS.length);
        assertThat(result.totalChecked()).isEqualTo(PortService.COMMON_PORTS.length);
    }

    @Test void rejectsInvalidPortRange() {
        var req = new PortDtos.PortScanRequest("1.1.1.1", null, 500, 100, false);
        assertThatThrownBy(() -> service.scan(req))
            .isInstanceOf(ApiException.class);
    }

    @Test void capsScanSize() {
        var req = new PortDtos.PortScanRequest("1.1.1.1", null, 1, 2000, false);
        assertThatThrownBy(() -> service.scan(req))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("max");
    }
}
