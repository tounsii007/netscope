package io.netscope.monitor;

import io.netscope.IntegrationTestBase;
import io.netscope.auth.ApiKey;
import io.netscope.auth.ApiKeyRepository;
import io.netscope.auth.ApiKeyService;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.hamcrest.Matchers.*;

class MonitorControllerIT extends IntegrationTestBase {

    @LocalServerPort int port;
    @Autowired ApiKeyRepository keys;
    @Autowired MonitorRepository monitors;

    static final String RAW_KEY = "netscope_test_abcdefghij1234567890";

    @BeforeEach void setup() {
        monitors.deleteAll();
        keys.deleteAll();
        ApiKey k = new ApiKey();
        k.setKeyHash(ApiKeyService.sha256(RAW_KEY));
        keys.save(k);
    }

    @Test void unauthorizedWithoutKey() {
        RestAssured.given().port(port).contentType(ContentType.JSON)
            .body("""
                {"name":"t","type":"http","target":"example.com","intervalSec":60}
                """)
            .when().post("/api/v1/monitor")
            .then().statusCode(401);
    }

    @Test void createAndList() {
        RestAssured.given().port(port).contentType(ContentType.JSON)
            .header("X-API-Key", RAW_KEY)
            .body("""
                {"name":"landing","type":"http","target":"example.com","intervalSec":300}
                """)
            .when().post("/api/v1/monitor")
            .then()
                .statusCode(200)
                .body("name", equalTo("landing"));

        RestAssured.given().port(port)
            .header("X-API-Key", RAW_KEY)
            .when().get("/api/v1/monitor")
            .then()
                .statusCode(200)
                .body("$", hasSize(1));
    }

    @Test void rejectsInvalidType() {
        RestAssured.given().port(port).contentType(ContentType.JSON)
            .header("X-API-Key", RAW_KEY)
            .body("""
                {"name":"t","type":"ftp","target":"example.com","intervalSec":60}
                """)
            .when().post("/api/v1/monitor")
            .then().statusCode(400);
    }

    @Test void rejectsIntervalTooLow() {
        RestAssured.given().port(port).contentType(ContentType.JSON)
            .header("X-API-Key", RAW_KEY)
            .body("""
                {"name":"t","type":"http","target":"example.com","intervalSec":10}
                """)
            .when().post("/api/v1/monitor")
            .then().statusCode(400);
    }
}
