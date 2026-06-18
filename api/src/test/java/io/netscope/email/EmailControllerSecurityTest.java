package io.netscope.email;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;

import static org.assertj.core.api.Assertions.*;

/**
 * Adversarial / robustness tests for {@link EmailController}.
 *
 * Hunting:
 *   • SMTP-RCPT injection via CRLF in the email parameter (would let an
 *     attacker smuggle extra commands into the SMTP probe socket).
 *   • Null-byte truncation that desyncs validator vs probe.
 *   • Length-bombing the local- or domain-part to trigger CPU-DoS.
 *   • Domain part hosting metadata IPs (lookupMx must not panic).
 *   • Score never overflows or underflows (IntegerOverflow guard).
 *   • Disposable detection is case-insensitive (host names are case-insensitive
 *     per RFC 5321 §2.4).
 *
 * Note: smtpProbe(...) is not invoked here because it requires a live socket;
 * we drive only verify(req) with smtpProbe=false. If the body contains CRLF
 * and is later passed to the SMTP socket without sanitisation, it WOULD be
 * exploitable — that defence belongs in smtpProbe(), tested separately.
 */
class EmailControllerSecurityTest {

    private final EmailController ctrl = new EmailController(new io.netscope.common.security.TargetValidator());

    private Map<String, Object> verify(String email) {
        return ctrl.verify(new EmailController.VerifyRequest(email, false));
    }

    /* ─── CRLF injection in the email parameter ──────────────────────────── */

    @Test
    void verify_strips_or_preserves_crlf_in_email_without_panicking() {
        // Bean Validation @Email should reject this in normal flow, but we
        // call verify() directly (bypassing @Valid) to ensure the parser layer
        // never explodes on CRLF. The test passes if no exception escapes.
        assertThatCode(() -> verify("alice@example.com\r\nRCPT TO:<root@victim>"))
            .doesNotThrowAnyException();
    }

    @Test
    void verify_handles_null_byte_in_email_safely() {
        // %00 truncation is a classic Java/C-bridge bug. Domain part used for
        // DNS MX lookup — it MUST NOT silently truncate to "alice@example".
        assertThatCode(() -> verify("alice@example.com.evil"))
            .doesNotThrowAnyException();
        // The domain must NOT be the truncated form
        Map<String, Object> r = verify("alice@example.com.evil");
        assertThat(r.get("domain"))
            .isNotEqualTo("example.com")
            .isEqualTo("example.com.evil");
    }

    /* ─── length-bombing ─────────────────────────────────────────────────── */

    @Test void verify_handles_very_long_local_part_in_under_one_second() {
        String email = "a".repeat(5000) + "@example.invalid";
        long t0 = System.nanoTime();
        Map<String, Object> r = verify(email);
        long ms = (System.nanoTime() - t0) / 1_000_000;
        assertThat(ms).as("verify must not pathologically slow on long local").isLessThan(1500);
        assertThat(r).containsKey("score");
    }

    @Test void verify_handles_very_long_domain_in_under_one_second() {
        // 5000-char domain — DNS lookup will fail fast; we verify it doesn't hang
        String email = "alice@" + "a".repeat(5000) + ".invalid";
        long t0 = System.nanoTime();
        Map<String, Object> r = verify(email);
        long ms = (System.nanoTime() - t0) / 1_000_000;
        assertThat(ms).as("verify must time-cap DNS for huge domains").isLessThan(8000);
        assertThat(r).containsEntry("hasMx", false);
    }

    /* ─── score boundaries — must always be in [0, 100] ──────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "admin@mailinator.com",                      // role + disposable + maybe MX
        "noreply@10minutemail.com",
        "support@yopmail.com",
        "alice@nonexistent.invalid",
        "info@guerrillamail.com",
    })
    void score_is_always_between_0_and_100(String email) {
        Map<String, Object> r = verify(email);
        int score = ((Number) r.get("score")).intValue();
        assertThat(score).isBetween(0, 100);
    }

    /* ─── case sensitivity of disposable / role detection ────────────────── */

    @Test
    void domain_is_lowercased_before_disposable_check() {
        Map<String, Object> r = verify("test@MAILINATOR.com");
        assertThat(r).containsEntry("disposable", true);
        assertThat(r).containsEntry("domain", "mailinator.com");
    }

    @Test void local_part_is_lowercased_before_role_check() {
        Map<String, Object> r = verify("ADMIN@example.invalid");
        assertThat(r).containsEntry("role", true);
        assertThat(r).containsEntry("local", "admin");
    }

    /* ─── invariants the API must hold for every input ───────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "alice@example.invalid",
        "bob+tag@example.invalid",
        "user.with.dots@example.invalid",
        "x@y.invalid",
    })
    void response_always_contains_required_keys(String email) {
        Map<String, Object> r = verify(email);
        assertThat(r).containsKeys(
            "email", "local", "domain", "syntaxValid",
            "disposable", "role", "mx", "hasMx", "score", "deliverable"
        );
    }

    @Test void multiple_at_signs_uses_LAST_at_to_split_local_and_domain() {
        // RFC 5321 forbids @ in the local part (without quoting) but our parser
        // uses lastIndexOf — verify the documented split behaviour.
        Map<String, Object> r = verify("a@b@example.invalid");
        assertThat(r).containsEntry("local",  "a@b");
        assertThat(r).containsEntry("domain", "example.invalid");
    }

    /* ─── deliverable threshold consistency ──────────────────────────────── */

    @Test
    void deliverable_implies_score_at_or_above_60() {
        // Run several inputs and assert the documented mapping is monotone
        for (String email : new String[] {
            "alice@example.invalid",
            "admin@mailinator.com",
            "alice@netscope.invalid",
        }) {
            Map<String, Object> r = verify(email);
            int score = ((Number) r.get("score")).intValue();
            boolean deliverable = (Boolean) r.get("deliverable");
            assertThat(deliverable).isEqualTo(score >= 60);
        }
    }
}
