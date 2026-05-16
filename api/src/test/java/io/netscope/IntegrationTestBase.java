package io.netscope;

import com.redis.testcontainers.RedisContainer;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers
public abstract class IntegrationTestBase {

    @SuppressWarnings("resource")
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgres:16-alpine"))
        .withDatabaseName("netscope_test")
        .withUsername("test")
        .withPassword("test")
        .withReuse(true);

    @SuppressWarnings("resource")
    static final RedisContainer REDIS = new RedisContainer(DockerImageName.parse("redis:7-alpine"))
        .withReuse(true);

    static {
        POSTGRES.start();
        REDIS.start();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        // Rate limit comes from application-test.yml (default 1000/min)
        // so other ITs don't trip the limiter; tests that want a
        // tighter limit (RateLimitIT) override via @TestPropertySource
        // or their own @DynamicPropertySource. Don't re-add the
        // property here — a @DynamicPropertySource always wins over
        // @TestPropertySource in Spring's environment, which would
        // make tighter-limit overrides ineffective.
    }
}
