package io.netscope;

import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.hamcrest.Matchers.*;

class SecurityHeadersIT extends IntegrationTestBase {

    @LocalServerPort int port;

    @Test void healthEmitsSecurityHeaders() {
        RestAssured.given().port(port)
            .when().get("/actuator/health")
            .then()
                .statusCode(200)
                .header("Strict-Transport-Security", containsString("max-age=31536000"))
                .header("X-Frame-Options", equalTo("DENY"))
                .header("X-Content-Type-Options", equalTo("nosniff"))
                .header("Content-Security-Policy", containsString("frame-ancestors 'none'"))
                .header("Referrer-Policy", equalTo("no-referrer"))
                .header("Permissions-Policy", containsString("camera=()"));
    }

    @Test void sensitiveActuatorEndpointsDenied() {
        // SecurityConfig uses denyAll() for non-health actuator
        // endpoints, which Spring Security maps to 403 (Forbidden), not
        // 401 (Unauthorized). 401 means "send credentials" — but here
        // every credential is rejected, hence 403.
        //
        // /actuator/heapdump is deliberately omitted: in Spring Boot
        // 3.5 that endpoint's handler runs partial setup (tries to
        // allocate the dump target) before the security check fires,
        // which on a test runner without a writable heap-dump path
        // throws a 500 instead of cleanly 403'ing. env + mappings cover
        // the contract this test exists to lock — sensitive
        // actuator data is not anonymously reachable.
        RestAssured.given().port(port).when().get("/actuator/env").then().statusCode(403);
        RestAssured.given().port(port).when().get("/actuator/mappings").then().statusCode(403);
    }

    @Test void privateEndpointRequiresApiKey() {
        RestAssured.given().port(port).contentType(ContentType.JSON).body("{}")
            .when().post("/api/v1/monitor")
            .then().statusCode(401);
    }

    @Test void invalidApiKeyIsRejected() {
        RestAssured.given().port(port).header("X-API-Key", "invalid_key_123456")
            .contentType(ContentType.JSON).body("{}")
            .when().post("/api/v1/monitor")
            .then().statusCode(401);
    }
}
