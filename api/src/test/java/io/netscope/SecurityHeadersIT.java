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
        RestAssured.given().port(port).when().get("/actuator/env").then().statusCode(401);
        RestAssured.given().port(port).when().get("/actuator/heapdump").then().statusCode(401);
        RestAssured.given().port(port).when().get("/actuator/mappings").then().statusCode(401);
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
