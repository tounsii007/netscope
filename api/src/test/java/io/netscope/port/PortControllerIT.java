package io.netscope.port;

import io.netscope.IntegrationTestBase;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.hamcrest.Matchers.*;

class PortControllerIT extends IntegrationTestBase {

    @LocalServerPort int port;

    @Test void checkRejectsPrivateTarget() {
        RestAssured.given().port(port).contentType(ContentType.JSON)
            .body("""
                { "target": "10.0.0.1", "port": 22, "protocol": "tcp" }
                """)
            .when().post("/api/v1/port/check")
            .then().statusCode(403).body("message", containsString("reserved"));
    }

    @Test void checkRejectsCloudMetadata() {
        RestAssured.given().port(port).contentType(ContentType.JSON)
            .body("""
                { "target": "169.254.169.254", "port": 80, "protocol": "tcp" }
                """)
            .when().post("/api/v1/port/check")
            .then().statusCode(403);
    }

    @Test void checkRejectsInvalidPort() {
        RestAssured.given().port(port).contentType(ContentType.JSON)
            .body("""
                { "target": "1.1.1.1", "port": 999999, "protocol": "tcp" }
                """)
            .when().post("/api/v1/port/check")
            .then().statusCode(400);
    }

    @Test void commonScanStructure() {
        RestAssured.given().port(port).contentType(ContentType.JSON)
            .body("""
                { "target": "1.1.1.1", "commonOnly": true }
                """)
            .when().post("/api/v1/port/scan")
            .then()
                .statusCode(200)
                .body("target", equalTo("1.1.1.1"))
                .body("results", hasSize(greaterThan(0)));
    }
}
