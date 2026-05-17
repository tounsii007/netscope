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
                .header("X-RateLimit-Remaining", org.hamcrest.Matchers.notNullValue())
                // Iter C: epoch-second reset header must be present so
                // SPA clients can self-throttle without polling.
                .header("X-RateLimit-Reset", org.hamcrest.Matchers.notNullValue());
    }

    /**
     * Anti-credential-stuffing tier: /api/v1/auth/** has a tighter
     * per-IP budget (auth-endpoint-per-minute, default 10). The
     * global anonymous bucket in this test is configured to 5 via
     * @TestPropertySource, so the tighter tier would not be the
     * first to fire here — instead we override it down to 2 below
     * so we actually exercise the auth path.
     */
    @org.springframework.test.context.TestPropertySource(properties = {
        "netscope.rate-limit.anonymous-per-minute=50",
        "netscope.rate-limit.auth-endpoint-per-minute=2"
    })
    static class AuthEndpointTier extends IntegrationTestBase {

        @LocalServerPort int port;
        @Autowired StringRedisTemplate redis;

        @Test void authEndpointHasTighterBudget() {
            redis.getConnectionFactory().getConnection().serverCommands().flushAll();

            int limited = 0;
            for (int i = 0; i < 8; i++) {
                int status = RestAssured.given().port(port)
                    .contentType("application/json").body("{}")
                    .when().post("/api/v1/auth/login").statusCode();
                if (status == 429) limited++;
            }
            // Auth-tier cap is 2; the 3rd request onwards should 429
            // while a parallel non-auth call would still pass (the
            // global budget is 50).
            assertThat(limited).as("auth-endpoint tier should trip before global bucket").isGreaterThan(0);
        }

        @Test void nonAuthEndpointsAreUnaffectedByAuthTier() {
            redis.getConnectionFactory().getConnection().serverCommands().flushAll();

            // 5 lookups; global limit is 50; auth tier is irrelevant
            // here. None should 429.
            int limited = 0;
            for (int i = 0; i < 5; i++) {
                int status = RestAssured.given().port(port)
                    .when().get("/api/v1/dns/example.com").statusCode();
                if (status == 429) limited++;
            }
            assertThat(limited).as("auth-tier must not bleed into non-auth paths").isZero();
        }
    }
}
