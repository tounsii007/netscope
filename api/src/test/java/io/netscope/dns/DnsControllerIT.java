package io.netscope.dns;

import io.netscope.IntegrationTestBase;
import io.restassured.RestAssured;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.hamcrest.Matchers.*;

class DnsControllerIT extends IntegrationTestBase {

    @LocalServerPort int port;

    @Test void rejectsInvalidDomain() {
        RestAssured.given().port(port)
            .when().get("/api/v1/dns/not a domain")
            .then().statusCode(anyOf(is(400), is(404)));
    }

    @Test
    @EnabledIfSystemProperty(named = "net.available", matches = "true")
    void resolvesPublicDomain() {
        RestAssured.given().port(port)
            .when().get("/api/v1/dns/cloudflare.com?type=A")
            .then()
                .statusCode(200)
                .body("domain", equalTo("cloudflare.com"))
                .body("records.A", not(empty()));
    }
}
