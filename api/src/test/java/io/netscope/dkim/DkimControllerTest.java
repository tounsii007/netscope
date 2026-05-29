package io.netscope.dkim;

import io.netscope.common.ApiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Input-validation unit tests for DkimController.
 *
 * Real DKIM resolution requires DNS — covered by integration tests under
 * the wider IT suite. Here we drive only the deterministic validation
 * paths (domain format, selector format, malformed-input rejection).
 */
class DkimControllerTest {

    // Tests cover input validation + helper parsing — none of them exercise
    // the parallel probe path, so any ExecutorService implementation works.
    // newSingleThreadExecutor keeps the test deterministic and never spawns
    // virtual threads in the JUnit JVM.
    private final DkimController ctrl =
        new DkimController(
            java.util.concurrent.Executors.newSingleThreadExecutor(),
            new io.netscope.common.ToolMetrics(
                new io.micrometer.core.instrument.simple.SimpleMeterRegistry()));

    @Test void rejects_empty_domain() {
        assertThatThrownBy(() -> ctrl.lookup("", null))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid domain");
    }

    @Test void rejects_domain_with_scheme() {
        assertThatThrownBy(() -> ctrl.lookup("https://example.com", null))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid domain");
    }

    @Test void rejects_domain_with_path() {
        assertThatThrownBy(() -> ctrl.lookup("example.com/foo", null))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid domain");
    }

    @Test void rejects_overlong_domain() {
        String tooLong = "a".repeat(254);
        assertThatThrownBy(() -> ctrl.lookup(tooLong, null))
            .isInstanceOf(ApiException.class);
    }

    @Test void rejects_selector_with_path_traversal() {
        assertThatThrownBy(() -> ctrl.lookup("example.com", "../etc/passwd"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid selector");
    }

    @Test void rejects_selector_with_whitespace() {
        assertThatThrownBy(() -> ctrl.lookup("example.com", "bad selector"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid selector");
    }

    @Test void accepts_well_formed_domain_returns_structured_result() {
        // Domain is RFC 2606 reserved so no record exists — the controller
        // returns present:false but a complete tried-selector list.
        var r = ctrl.lookup("example.invalid", null);
        assertThat(r).containsKey("domain").containsKey("triedSelectors");
        assertThat(r.get("domain")).isEqualTo("example.invalid");
        assertThat(r.get("triedSelectors")).asList().isNotEmpty();
    }

    @Test void accepts_explicit_selector_short_circuits_probe_list() {
        var r = ctrl.lookup("example.invalid", "myselector");
        assertThat(r.get("selector")).isEqualTo("myselector");
        // Only the explicit selector should appear in the tried list.
        assertThat(r.get("triedSelectors")).asList().hasSize(1);
    }

    /* ─── parseTags ────────────────────────────────────────────────────── */

    @Test void parseTags_extracts_dkim_key_value_pairs() {
        var tags = DkimController.parseTags("v=DKIM1; k=rsa; p=ABC123; h=sha256");
        assertThat(tags)
            .containsEntry("v", "DKIM1")
            .containsEntry("k", "rsa")
            .containsEntry("p", "ABC123")
            .containsEntry("h", "sha256");
    }

    @Test void parseTags_trims_whitespace_around_keys_and_values() {
        var tags = DkimController.parseTags("v = DKIM1 ;   k=rsa  ;p=XYZ");
        assertThat(tags)
            .containsEntry("v", "DKIM1")
            .containsEntry("k", "rsa")
            .containsEntry("p", "XYZ");
    }

    @Test void parseTags_handles_empty_revoked_p_value() {
        // Empty p= signals a revoked key per RFC 6376. The map entry
        // MUST exist (so the controller can flag revoked: true) — not be
        // silently dropped.
        var tags = DkimController.parseTags("v=DKIM1; k=rsa; p=");
        assertThat(tags).containsEntry("p", "");
    }

    @Test void parseTags_ignores_malformed_pairs_without_equals() {
        var tags = DkimController.parseTags("v=DKIM1; not-a-pair; k=rsa");
        assertThat(tags).containsOnlyKeys("v", "k");
    }

    /* ─── parseHashAlgs ────────────────────────────────────────────────── */

    @Test void parseHashAlgs_defaults_when_absent() {
        // RFC 6376 §3.6.1: missing h= means accept any algorithm. We
        // default to the two deployed-on-the-Internet choices.
        assertThat(DkimController.parseHashAlgs(null)).containsExactly("sha1", "sha256");
        assertThat(DkimController.parseHashAlgs("")).containsExactly("sha1", "sha256");
        assertThat(DkimController.parseHashAlgs("   ")).containsExactly("sha1", "sha256");
    }

    @Test void parseHashAlgs_splits_colon_delimited_list() {
        assertThat(DkimController.parseHashAlgs("sha256:sha512"))
            .containsExactly("sha256", "sha512");
    }

    @Test void parseHashAlgs_normalises_to_lowercase() {
        assertThat(DkimController.parseHashAlgs("SHA256:Sha512"))
            .containsExactly("sha256", "sha512");
    }

    /* ─── decodeKey ────────────────────────────────────────────────────── */

    @Test void decodeKey_returns_fixed_256_bits_for_ed25519() throws Exception {
        // ed25519 keys are fixed length — we don't actually decode the
        // bytes for them (no JCE Ed25519 KeyFactory until JDK 15).
        var info = DkimController.decodeKey("AAA=", "ed25519");
        assertThat(info.algorithm()).isEqualTo("Ed25519");
        assertThat(info.bits()).isEqualTo(256);
    }

    @Test void decodeKey_throws_on_malformed_base64() {
        // !!! is not valid base64 — JCE throws IllegalArgumentException
        // wrapped at our boundary. The controller catches this and
        // surfaces an unparseable-key warning.
        assertThatThrownBy(() -> DkimController.decodeKey("!!!not-base64!!!", "rsa"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void decodeKey_reports_rsa_modulus_bit_length() throws Exception {
        // Generate a real 2048-bit RSA key, encode its public component
        // in X.509 SubjectPublicKeyInfo, then ask decodeKey() to recover
        // the bit length. This pins the round-trip rather than trusting
        // a static fixture that may rot when JCE encoding changes.
        java.security.KeyPairGenerator kpg = java.security.KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        java.security.KeyPair kp = kpg.generateKeyPair();
        String b64 = java.util.Base64.getEncoder().encodeToString(kp.getPublic().getEncoded());

        var info = DkimController.decodeKey(b64, "rsa");
        assertThat(info.algorithm()).isEqualTo("RSA");
        assertThat(info.bits()).isEqualTo(2048);
    }

    @Test void decodeKey_strips_whitespace_dns_providers_inject() throws Exception {
        // Some DNS providers split long TXT chunks with spaces or
        // newlines that survive concatenation. The decoder MUST treat
        // these as transport noise rather than payload.
        java.security.KeyPairGenerator kpg = java.security.KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        java.security.KeyPair kp = kpg.generateKeyPair();
        String b64 = java.util.Base64.getEncoder().encodeToString(kp.getPublic().getEncoded());

        // Insert spaces every 16 chars + a stray newline; recovery must succeed.
        StringBuilder spaced = new StringBuilder();
        for (int i = 0; i < b64.length(); i += 16) {
            spaced.append(b64, i, Math.min(b64.length(), i + 16)).append(' ');
        }
        spaced.append('\n');
        var info = DkimController.decodeKey(spaced.toString(), "rsa");
        assertThat(info.bits()).isEqualTo(2048);
    }

    /* ─── parsing-edge cases: oversized records, mixed casing, mid-rotation ───── */

    @Test void parseTags_handles_record_with_tags_in_unusual_order() {
        // RFC 6376 doesn't mandate tag order. Records emitted by some
        // signing infrastructures put p= before v= even though the
        // canonical example shows v= first. Both must parse cleanly.
        var tags = DkimController.parseTags("p=ABC; k=rsa; v=DKIM1");
        assertThat(tags)
            .containsEntry("p", "ABC")
            .containsEntry("k", "rsa")
            .containsEntry("v", "DKIM1");
    }

    @Test void parseTags_tolerates_extra_whitespace_between_segments() {
        // crt-style providers re-quote and re-space TXT chunks
        // aggressively. The parser must not drop tags when spacing
        // varies between separators.
        var tags = DkimController.parseTags("  v=DKIM1  ;  k=rsa  ;  p=DEF  ;  ");
        assertThat(tags)
            .containsEntry("v", "DKIM1")
            .containsEntry("k", "rsa")
            .containsEntry("p", "DEF");
    }

    @Test void parseHashAlgs_handles_only_sha512_declared() {
        // A few high-volume senders declare sha512 only. Spec-compliant
        // verifiers must still attempt verification with that algorithm,
        // so the parser MUST surface it accurately.
        assertThat(DkimController.parseHashAlgs("sha512")).containsExactly("sha512");
    }

    @Test void parseHashAlgs_drops_empty_segments_from_malformed_colon_lists() {
        // Defensive: a stray double-colon shouldn't surface as an empty
        // algorithm name.
        assertThat(DkimController.parseHashAlgs("sha256::sha512")).containsExactly("sha256", "sha512");
    }

    @Test void decodeKey_round_trips_4096_bit_rsa_key() throws Exception {
        // Real-world senders increasingly publish 4096-bit keys.
        // Confirm we report the bit length accurately for that case
        // (no truncation, no overflow).
        java.security.KeyPairGenerator kpg = java.security.KeyPairGenerator.getInstance("RSA");
        kpg.initialize(4096);
        java.security.KeyPair kp = kpg.generateKeyPair();
        String b64 = java.util.Base64.getEncoder().encodeToString(kp.getPublic().getEncoded());

        var info = DkimController.decodeKey(b64, "rsa");
        assertThat(info.bits()).isEqualTo(4096);
    }
}
