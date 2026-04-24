package io.netscope.ip;

import com.github.tomakehurst.wiremock.WireMockServer;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.netscope.IntegrationTestBase;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;

import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static java.time.Duration.ofSeconds;

class IpServiceCircuitBreakerTest extends IntegrationTestBase {

    static WireMockServer wm;

    @Autowired IpService ipService;
    @Autowired CircuitBreakerRegistry cbRegistry;

    @BeforeAll static void startWireMock() {
        wm = new WireMockServer(options().dynamicPort());
        wm.start();
    }
    @AfterAll static void stop() { wm.stop(); }

    @BeforeEach void reset() {
        wm.resetAll();
        cbRegistry.circuitBreaker("ipinfo").reset();
    }

    @Test void fallbackEngagedAfterFailures() {
        wm.stubFor(get(urlMatching("/.*"))
            .willReturn(aResponse().withStatus(500)));

        // Trigger enough failures to open the breaker
        for (int i = 0; i < 30; i++) {
            Map<String, Object> r = ipService.fetchFromIpinfo("8.8.8.8");
            if (Boolean.TRUE.equals(r.get("degraded"))) {
                assertThat(r).containsEntry("reason", "upstream unavailable");
                return;
            }
        }
        // Breaker should have opened
        assertThat(cbRegistry.circuitBreaker("ipinfo").getState())
            .isIn(io.github.resilience4j.circuitbreaker.CircuitBreaker.State.OPEN,
                  io.github.resilience4j.circuitbreaker.CircuitBreaker.State.HALF_OPEN);
    }

    @Test void closedBreakerAllowsSuccessPath() {
        await().atMost(ofSeconds(1)).untilAsserted(() ->
            assertThat(cbRegistry.circuitBreaker("ipinfo").getState())
                .isEqualTo(io.github.resilience4j.circuitbreaker.CircuitBreaker.State.CLOSED));
    }
}
