package io.netscope;

import io.restassured.RestAssured;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Override the default 1000/min anonymous limit from application-test.yml
 * down to 5 so a short burst actually trips the limiter. This works now
 * because IntegrationTestBase no longer pins the property via
 * @DynamicPropertySource — dynamic sources beat @TestPropertySource in
 * Spring's environment, and the parent's override had been silently
 * shadowing this value before.
 */
@TestPropertySource(properties = "netscope.rate-limit.anonymous-per-minute=5")
class RateLimitIT extends IntegrationTestBase {

    @LocalServerPort int port;
    @Autowired StringRedisTemplate redis;

    @Test void anonymousRequestsGet429AfterLimit() {
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();

        int over429 = 0;
        for (int i = 0; i < 10; i++) {
            int status = RestAssured.given().port(port)
                .when().get("/actuator/health").statusCode();
            if (status == 429) over429++;
        }
        // actuator/health is on /actuator/**, not /api/** — so rate limit should NOT apply.
        assertThat(over429).isZero();
    }

    @Test void apiEndpointsAreRateLimited() {
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();

        int limited = 0;
        for (int i = 0; i < 20; i++) {
            int status = RestAssured.given().port(port)
                .when().get("/api/v1/dns/cloudflare.com").statusCode();
            if (status == 429) limited++;
        }
        assertThat(limited).isGreaterThan(0);
    }

    @Test void rateLimitHeadersAreSet() {
        redis.getConnectionFactory().getConnection().serverCommands().flushAll();

        RestAssured.given().port(port)
            .when().get("/api/v1/dns/example.com")
            .then()
                .header("X-RateLimit-Limit", org.hamcrest.Matchers.notNullValue())
                .header("X-RateLimit-Remaining", org.hamcrest.Matchers.notNullValue());
    }
}
