package io.netscope;

import io.restassured.RestAssured;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.hamcrest.Matchers.is;

class SsrfProtectionIT extends IntegrationTestBase {

    @LocalServerPort int port;

    @ParameterizedTest
    @ValueSource(strings = {
        "127.0.0.1", "localhost", "0.0.0.0",
        "10.0.0.1", "192.168.1.1", "172.16.0.1",
        "169.254.169.254", // AWS metadata
        "::1", "fe80::1"
    })
    void httpHeadersInspectorRejectsInternalTargets(String target) {
        RestAssured.given().port(port)
            .queryParam("url", "https://" + target)
            .when().get("/api/v1/headers")
            .then().statusCode(anyOf(is(400), is(403)));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "127.0.0.1", "10.0.0.1", "169.254.169.254"
    })
    void cdnDetectorRejectsInternalTargets(String target) {
        RestAssured.given().port(port)
            .when().get("/api/v1/cdn/{h}", target)
            .then().statusCode(anyOf(is(400), is(403)));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "127.0.0.1", "10.0.0.1"
    })
    void sslInspectorRejectsInternalTargets(String host) {
        RestAssured.given().port(port)
            .when().get("/api/v1/ssl/{h}", host)
            .then().statusCode(anyOf(is(400), is(403)));
    }

    private static org.hamcrest.Matcher<Integer> anyOf(org.hamcrest.Matcher<Integer>... ms) {
        return org.hamcrest.Matchers.anyOf(ms);
    }
}
