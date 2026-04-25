package io.netscope.user;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.*;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;

/**
 * Pure unit tests for the HS256 JwtService.
 *
 * Uses Spring's MockEnvironment (a real implementation) instead of a
 * Mockito-mocked Environment so the suite doesn't depend on bytecode
 * instrumentation that breaks on newer JVMs.
 *
 * Covers:
 *  • init() guards (length, weak-secret rejection in prod, warning in dev)
 *  • round-trip issue/parse with all required claims
 *  • expired tokens return null
 *  • tampered tokens (signature, payload, header) return null
 *  • wrong issuer returns null
 *  • malformed tokens (wrong segment count, garbage) return null
 *  • configured TTL is honoured
 */
class JwtServiceTest {

    private static final String STRONG_SECRET = "this-is-a-strong-32-plus-character-secret-for-tests";
    private static final String ISSUER        = "https://netscope.io";

    MockEnvironment env;
    JwtService svc;

    @BeforeEach
    void setup() {
        env = new MockEnvironment();
        svc = new JwtService(env);
        ReflectionTestUtils.setField(svc, "secret",     STRONG_SECRET);
        ReflectionTestUtils.setField(svc, "issuer",     ISSUER);
        ReflectionTestUtils.setField(svc, "ttlSeconds", 3600L);
    }

    /* ─── init() guards ──────────────────────────────────────────────────── */

    @Test void init_rejectsNullSecret() {
        ReflectionTestUtils.setField(svc, "secret", null);
        assertThatThrownBy(() -> svc.init())
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("at least 32 characters");
    }

    @Test void init_rejectsShortSecret() {
        ReflectionTestUtils.setField(svc, "secret", "too-short");
        assertThatThrownBy(() -> svc.init())
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("at least 32 characters");
    }

    @Test void init_rejectsKnownPlaceholderInProductionProfile() {
        env.setActiveProfiles("prod");
        ReflectionTestUtils.setField(svc, "secret", "change-me-in-production-must-be-32-characters-minimum");
        assertThatThrownBy(() -> svc.init())
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("placeholder");
    }

    @Test void init_acceptsKnownPlaceholderInDev_butWarns() {
        env.setActiveProfiles("dev");
        ReflectionTestUtils.setField(svc, "secret", "change-me-in-production-must-be-32-characters-minimum");
        // Should NOT throw — just warn
        svc.init();
    }

    @Test void init_acceptsStrongSecretInProd() {
        env.setActiveProfiles("prod");
        svc.init();   // no exception
    }

    /* ─── issue / parse round-trip ───────────────────────────────────────── */

    @Test void issueAndParse_roundTrip_includesAllStandardClaims() {
        svc.init();

        UUID userId = UUID.randomUUID();
        String tok = svc.issue(userId, "alice@example.com", Map.of("plan", "pro"));
        assertThat(tok).isNotBlank().contains(".");
        assertThat(tok.split("\\.")).hasSize(3);

        Map<String, Object> claims = svc.parse(tok);
        assertThat(claims).isNotNull();
        assertThat(claims.get("sub")).isEqualTo(userId.toString());
        assertThat(claims.get("iss")).isEqualTo(ISSUER);
        assertThat(claims.get("email")).isEqualTo("alice@example.com");
        assertThat(claims.get("plan")).isEqualTo("pro");
        assertThat(((Number) claims.get("iat")).longValue()).isPositive();
        assertThat(((Number) claims.get("exp")).longValue())
            .isGreaterThan(((Number) claims.get("iat")).longValue());
    }

    /* ─── invalid tokens ─────────────────────────────────────────────────── */

    @Test void parse_returnsNullForExpiredToken() {
        ReflectionTestUtils.setField(svc, "ttlSeconds", -10L);  // already expired
        svc.init();

        String tok = svc.issue(UUID.randomUUID(), "x@y", Map.of());
        assertThat(svc.parse(tok)).isNull();
    }

    @Test void parse_returnsNullForTamperedSignature() {
        svc.init();

        String tok = svc.issue(UUID.randomUUID(), "a@b", Map.of());
        // Flip a character in the signature segment
        String[] parts = tok.split("\\.");
        char c = parts[2].charAt(0);
        parts[2] = (c == 'A' ? 'B' : 'A') + parts[2].substring(1);
        String tampered = parts[0] + "." + parts[1] + "." + parts[2];

        assertThat(svc.parse(tampered)).isNull();
    }

    @Test void parse_returnsNullForTamperedPayload() {
        svc.init();

        String tok = svc.issue(UUID.randomUUID(), "a@b", Map.of());
        String[] parts = tok.split("\\.");
        // Replace the payload with a forged base64 segment
        String forgedJson = "{\"sub\":\"forged\",\"iss\":\"" + ISSUER + "\",\"exp\":9999999999}";
        String forged = Base64.getUrlEncoder().withoutPadding().encodeToString(forgedJson.getBytes());
        String tampered = parts[0] + "." + forged + "." + parts[2];
        assertThat(svc.parse(tampered)).isNull();
    }

    @Test void parse_returnsNullForWrongIssuer() {
        svc.init();

        String tok = svc.issue(UUID.randomUUID(), "a@b", Map.of());
        // Re-init with a different issuer; same token now should reject
        ReflectionTestUtils.setField(svc, "issuer", "https://evil.example");
        assertThat(svc.parse(tok)).isNull();
    }

    @Test void parse_returnsNullForMalformedToken() {
        svc.init();

        assertThat(svc.parse("not.a.token.at.all")).isNull();
        assertThat(svc.parse("only-one-segment")).isNull();
        assertThat(svc.parse("two.segments")).isNull();
        assertThat(svc.parse("")).isNull();
    }

    @Test void parse_returnsNullForGarbageBase64() {
        svc.init();
        assertThat(svc.parse("###.@@@.$$$")).isNull();
    }

    /* ─── ttl honoured ───────────────────────────────────────────────────── */

    @Test void issued_token_carries_configured_ttl() {
        ReflectionTestUtils.setField(svc, "ttlSeconds", 7200L);
        svc.init();

        String tok = svc.issue(UUID.randomUUID(), "x@y", Map.of());
        Map<String, Object> claims = svc.parse(tok);
        long iat = ((Number) claims.get("iat")).longValue();
        long exp = ((Number) claims.get("exp")).longValue();
        assertThat(exp - iat).isEqualTo(TimeUnit.HOURS.toSeconds(2));
    }
}
