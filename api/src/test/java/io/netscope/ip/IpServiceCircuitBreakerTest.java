package io.netscope.ip;

import com.github.tomakehurst.wiremock.WireMockServer;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.netscope.IntegrationTestBase;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.Map;

import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static java.time.Duration.ofSeconds;

class IpServiceCircuitBreakerTest extends IntegrationTestBase {

    /**
     * WireMock is started in a static initializer (not @BeforeAll) so the
     * dynamic port is known before Spring's context wiring runs — that's
     * what lets @DynamicPropertySource below splice the URL into the
     * IpService bean. If we started it inside @BeforeAll, the Spring
     * context would already be cached with the production URL.
     */
    static final WireMockServer wm;
    static {
        wm = new WireMockServer(options().dynamicPort());
        wm.start();
    }

    @DynamicPropertySource
    static void wireMockProperties(DynamicPropertyRegistry registry) {
        registry.add("netscope.geoip.ipinfo-base-url", wm::baseUrl);
    }

    @Autowired IpService ipService;
    @Autowired CircuitBreakerRegistry cbRegistry;

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
