package io.netscope.email;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for EmailController.verify() classification logic.
 *
 * Real MX lookups rely on DNS — they're flaky in unit tests, so we drive
 * the controller against domains we know cannot resolve (.invalid TLD,
 * RFC 2606) and assert the deterministic side of the response: parsing,
 * disposable detection, role-account detection and the score deduction.
 */
class EmailControllerTest {

    private final EmailController ctrl = new EmailController();

    private Map<String, Object> verify(String email) {
        return ctrl.verify(new EmailController.VerifyRequest(email, false));
    }

    /* ─── parsing ────────────────────────────────────────────────────────── */

    @Test void parses_local_and_domain_parts() {
        Map<String, Object> r = verify("alice@netscope.invalid");
        assertThat(r).containsEntry("email", "alice@netscope.invalid");
        assertThat(r).containsEntry("local", "alice");
        assertThat(r).containsEntry("domain", "netscope.invalid");
        assertThat(r).containsEntry("syntaxValid", true);
    }

    @Test void normalises_to_lowercase_and_trims_whitespace() {
        Map<String, Object> r = verify("  ALICE@Foo.INVALID  ");
        assertThat(r).containsEntry("email", "alice@foo.invalid");
        assertThat(r).containsEntry("local", "alice");
        assertThat(r).containsEntry("domain", "foo.invalid");
    }

    /* ─── disposable detection ───────────────────────────────────────────── */

    @Test void flags_known_disposable_domains() {
        assertThat(verify("test@mailinator.com")).containsEntry("disposable", true);
        assertThat(verify("test@yopmail.com")).containsEntry("disposable", true);
        assertThat(verify("test@10minutemail.com")).containsEntry("disposable", true);
        assertThat(verify("test@guerrillamail.com")).containsEntry("disposable", true);
    }

    @Test void does_not_flag_non_disposable_domains() {
        assertThat(verify("test@gmail.invalid")).containsEntry("disposable", false);
        assertThat(verify("test@netscope.invalid")).containsEntry("disposable", false);
    }

    /* ─── role detection ─────────────────────────────────────────────────── */

    @Test void flags_role_local_parts() {
        assertThat(verify("admin@example.invalid")).containsEntry("role", true);
        assertThat(verify("noreply@example.invalid")).containsEntry("role", true);
        assertThat(verify("postmaster@example.invalid")).containsEntry("role", true);
        assertThat(verify("support@example.invalid")).containsEntry("role", true);
    }

    @Test void does_not_flag_personal_local_parts() {
        assertThat(verify("alice@example.invalid")).containsEntry("role", false);
        assertThat(verify("bob.smith@example.invalid")).containsEntry("role", false);
    }

    /* ─── scoring ────────────────────────────────────────────────────────── */

    @Test void score_zero_floor_is_enforced_for_combined_penalties() {
        // Disposable (-50) + role (-10) + no MX (-60) ⇒ would underflow
        Map<String, Object> r = verify("admin@mailinator.com");
        int score = ((Number) r.get("score")).intValue();
        assertThat(score).isGreaterThanOrEqualTo(0);
    }

    @Test void deliverable_flag_matches_score_threshold_60() {
        // .invalid → no MX → score = 100 - 60 = 40 → not deliverable
        Map<String, Object> r = verify("alice@netscope.invalid");
        int score = ((Number) r.get("score")).intValue();
        assertThat(r.get("deliverable")).isEqualTo(score >= 60);
    }

    /* ─── MX field always populated, even when empty ─────────────────────── */

    @Test void mx_field_is_always_a_list_even_when_empty() {
        Map<String, Object> r = verify("alice@netscope.invalid");
        assertThat(r).containsKey("mx");
        assertThat(r.get("mx")).isInstanceOf(java.util.List.class);
        assertThat(r).containsEntry("hasMx", false);
    }
}
