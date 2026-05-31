package io.netscope.ssl;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.security.cert.X509Certificate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit coverage for {@link SslWarningCollector#collect}.
 *
 * The collector encodes three independent risk rules that the SSL
 * inspector surfaces verbatim to the user:
 *
 *   • Expiry runway   — <0 d "expired", <14 d "renew today", <30 d "renew soon"
 *   • Key strength    — RSA below 2048 bits is weak
 *   • Signature alg   — MD5 or SHA-1 still in use
 *
 * The wording, the branch boundaries, and the order in which warnings
 * appear are all part of the user-visible contract — UI renders the
 * list as-is. These tests pin each rule and its boundary so any later
 * change has to update the test deliberately rather than silently
 * shifting the threshold (e.g. "renew soon" leaking down to 14 days
 * or up to 31).
 */
class SslWarningCollectorTest {

    /* ─── expiry-runway branches ──────────────────────────────────────── */

    @Test void expired_certificate_emits_single_expired_warning() {
        // daysLeft < 0 is the strongest signal — user is already serving
        // an expired cert. We must surface "certificate has expired" and
        // nothing else from the expiry block (key + sig are fine here).
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, -1L, rsaKey(2048));
        assertThat(warnings).containsExactly("certificate has expired");
    }

    @Test void renew_today_branch_uses_days_count_without_renew_soon_suffix() {
        // daysLeft in [0, 14) is the "renew today" branch — short,
        // urgent wording without the "— renew soon" suffix. The
        // suffix appears only in the wider [14, 30) band, so we pin
        // the absence of "renew soon" here to prevent the two
        // messages collapsing into one in a future refactor.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 13L, rsaKey(2048));
        assertThat(warnings).containsExactly("certificate expires in 13 days");
    }

    @Test void renew_soon_branch_includes_em_dash_renew_soon_suffix() {
        // daysLeft in [14, 30) is the lower-urgency band. 29 sits one
        // below the upper boundary — pinning here also catches a
        // future off-by-one if someone changes "< 30" to "<= 30".
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 29L, rsaKey(2048));
        assertThat(warnings).containsExactly("certificate expires in 29 days — renew soon");
    }

    @Test void boundary_exactly_at_14_falls_into_renew_soon_not_renew_today() {
        // The branch is "< 14", so 14 must NOT match the renew-today
        // text. Pinning the exact boundary so a "<=" slip-up is caught.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 14L, rsaKey(2048));
        assertThat(warnings).containsExactly("certificate expires in 14 days — renew soon");
    }

    @Test void boundary_exactly_at_30_emits_no_expiry_warning() {
        // The "renew soon" branch is "< 30", so 30 days falls into the
        // healthy band. No expiry warning at all (and the key + sig
        // here are also clean, so the whole list is empty).
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 30L, rsaKey(2048));
        assertThat(warnings).isEmpty();
    }

    @Test void boundary_exactly_at_zero_is_not_expired_but_renew_today() {
        // daysLeft == 0 hits the "< 0" guard as false, so it falls
        // into the "< 14" branch with "0 days" wording — pinning
        // because zero is the edge between expired and renew-today.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 0L, rsaKey(2048));
        assertThat(warnings).containsExactly("certificate expires in 0 days");
    }

    @ParameterizedTest
    @ValueSource(longs = {30L, 31L, 90L, 365L, 730L})
    void healthy_expiry_runway_skips_all_expiry_warnings(long daysLeft) {
        // Anything ≥ 30 days bypasses the expiry block entirely.
        // Multiple values pinned to prove no upper bound exists.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, daysLeft, rsaKey(2048));
        assertThat(warnings).isEmpty();
    }

    /* ─── RSA key strength rule ───────────────────────────────────────── */

    @Test void rsa_key_below_2048_bits_emits_weak_key_warning() {
        // 1024-bit RSA has been factorable in research contexts for
        // over a decade. The collector must flag anything below 2048.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(1024));
        assertThat(warnings).containsExactly("RSA key < 2048 bits is considered weak");
    }

    @ParameterizedTest
    @ValueSource(ints = {512, 768, 1024, 1536, 2047})
    void rsa_key_strictly_below_2048_always_flagged(int bits) {
        // All historical weak sizes plus the off-by-one (2047) must
        // trigger the warning — pins the strict "< 2048" comparison.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(bits));
        assertThat(warnings).contains("RSA key < 2048 bits is considered weak");
    }

    @Test void rsa_key_at_exactly_2048_bits_does_not_emit_weak_key_warning() {
        // The boundary value (2048) is the minimum acceptable strength.
        // Pinning so a future "<=" slip wouldn't tank every modern site.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(2048));
        assertThat(warnings).isEmpty();
    }

    @Test void rsa_key_at_4096_bits_is_not_flagged() {
        // High-strength RSA must not be flagged.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(4096));
        assertThat(warnings).isEmpty();
    }

    @Test void non_rsa_algorithm_below_2048_bits_is_not_flagged() {
        // The "< 2048" rule applies only to RSA — 256-bit ECDSA is
        // perfectly strong and must NOT be flagged. Pins the "RSA".equals
        // guard so an EC-allowed-everything refactor can't accidentally
        // tank an EC handshake's warning list.
        X509Certificate leaf = leafWithSig("SHA256withECDSA");
        Map<String, Object> ecKey = new HashMap<>();
        ecKey.put("algorithm", "EC");
        ecKey.put("bits", 256);
        assertThat(SslWarningCollector.collect(leaf, 365L, ecKey)).isEmpty();
    }

    @Test void rsa_key_missing_bits_entry_does_not_npe_and_skips_weak_check() {
        // Production handshake parsers sometimes fail to read the bit
        // count — they hand the collector a map with the algorithm but
        // no "bits" key. The collector must skip the weak-key check
        // cleanly rather than NPE on the null Integer.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        Map<String, Object> noBits = new HashMap<>();
        noBits.put("algorithm", "RSA");
        // intentionally no "bits" entry
        assertThat(SslWarningCollector.collect(leaf, 365L, noBits)).isEmpty();
    }

    @Test void leafKey_missing_algorithm_entry_does_not_throw() {
        // String.valueOf(null) is "null" — guaranteed safe — so a
        // missing algorithm key shouldn't NPE or trigger the RSA branch.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        Map<String, Object> noAlg = new HashMap<>();
        noAlg.put("bits", 2048);
        assertThat(SslWarningCollector.collect(leaf, 365L, noAlg)).isEmpty();
    }

    /* ─── signature algorithm rule ────────────────────────────────────── */

    @Test void sha1_signature_algorithm_is_flagged() {
        // SHA-1 chosen-prefix collision (SHAttered) means SHA-1 in cert
        // signatures has been deprecated since 2017. Must be flagged.
        X509Certificate leaf = leafWithSig("SHA1withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(2048));
        assertThat(warnings).containsExactly("weak signature algorithm: SHA1withRSA");
    }

    @Test void md5_signature_algorithm_uppercase_is_flagged() {
        // MD5 collisions were demonstrated in 2008; cert chains using
        // MD5 are trivially forgeable. The toLowerCase() guard means
        // any casing must trigger. Test uppercase "MD5" embedded in
        // "MD5withRSA" pins the case-insensitivity.
        X509Certificate leaf = leafWithSig("MD5withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(2048));
        assertThat(warnings).containsExactly("weak signature algorithm: MD5withRSA");
    }

    @ParameterizedTest
    @ValueSource(strings = {"SHA1withRSA", "SHA1withDSA", "SHA1withECDSA", "sha1withRSA"})
    void any_sha1_signature_variant_is_flagged(String sigAlg) {
        // The check is startsWith("sha1") after lower-casing, so the
        // family of sha1-prefixed names must all trip. Pinning across
        // RSA/DSA/ECDSA + a mixed-case variant ensures the lower-case
        // guard isn't lost in a future refactor.
        X509Certificate leaf = leafWithSig(sigAlg);
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(2048));
        assertThat(warnings).contains("weak signature algorithm: " + sigAlg);
    }

    @ParameterizedTest
    @ValueSource(strings = {"MD5withRSA", "md5withRSA", "MD5andRSA"})
    void any_md5_signature_variant_is_flagged(String sigAlg) {
        // The MD5 check is contains() so it catches the byte "md5"
        // anywhere in the algorithm name regardless of casing.
        X509Certificate leaf = leafWithSig(sigAlg);
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(2048));
        assertThat(warnings).contains("weak signature algorithm: " + sigAlg);
    }

    @ParameterizedTest
    @ValueSource(strings = {"SHA256withRSA", "SHA384withRSA", "SHA512withRSA", "SHA256withECDSA"})
    void modern_signature_algorithms_are_not_flagged(String sigAlg) {
        // SHA-2 family and above are all currently strong — must NOT
        // be flagged. Pins the negative space so a future "anything
        // containing 'sha'" mistake gets caught.
        X509Certificate leaf = leafWithSig(sigAlg);
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(2048));
        assertThat(warnings).isEmpty();
    }

    @Test void null_signature_algorithm_does_not_throw() {
        // X509Certificate.getSigAlgName() can return null on
        // unusual / malformed certs. The collector must guard
        // against that — the null check is in production code.
        X509Certificate leaf = mock(X509Certificate.class);
        when(leaf.getSigAlgName()).thenReturn(null);
        assertThat(SslWarningCollector.collect(leaf, 365L, rsaKey(2048))).isEmpty();
    }

    /* ─── negative-space: don't over-flag a healthy cert ──────────────── */

    @Test void healthy_cert_with_strong_key_and_sig_yields_empty_warnings() {
        // The control case: 90-day Let's-Encrypt-style cert with
        // RSA-2048 + SHA-256. The collector must emit zero warnings.
        // This is the negative-space proof that a perfectly healthy
        // cert isn't accidentally flagged by any of the three rules.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        assertThat(SslWarningCollector.collect(leaf, 89L, rsaKey(2048))).isEmpty();
    }

    @Test void modern_strong_signature_with_weak_rsa_only_flags_key() {
        // Negative space for the signature rule: SHA-256 cert with a
        // weak 1024-bit RSA key must produce ONLY the key warning,
        // not the sig warning — pins that the two rules are
        // independent so a regression on one doesn't cascade.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 365L, rsaKey(1024));
        assertThat(warnings).containsExactly("RSA key < 2048 bits is considered weak");
    }

    /* ─── adversarial: simultaneous-rule firing ───────────────────────── */

    @Test void all_three_rules_fire_together_in_documented_order() {
        // Worst-case cert: expired AND weak key AND SHA-1 sig. All
        // three warnings must surface, and the order is fixed:
        // expiry → key → signature (matches the order of the if-blocks
        // in the source). UI renders the list verbatim so the order
        // is part of the contract.
        X509Certificate leaf = leafWithSig("SHA1withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, -5L, rsaKey(1024));
        assertThat(warnings).containsExactly(
            "certificate has expired",
            "RSA key < 2048 bits is considered weak",
            "weak signature algorithm: SHA1withRSA"
        );
    }

    @Test void renew_soon_branch_can_coexist_with_weak_key_and_weak_sig() {
        // Pins that the renew-soon expiry branch (not the renew-today
        // one) is still composable with the other two warnings.
        X509Certificate leaf = leafWithSig("MD5withRSA");
        List<String> warnings = SslWarningCollector.collect(leaf, 20L, rsaKey(512));
        assertThat(warnings).containsExactly(
            "certificate expires in 20 days — renew soon",
            "RSA key < 2048 bits is considered weak",
            "weak signature algorithm: MD5withRSA"
        );
    }

    /* ─── input-shape failure modes (null map, etc.) ──────────────────── */

    @Test void null_leafKey_map_throws_npe() {
        // The collector dereferences leafKey.get("algorithm") with no
        // null guard. We pin the current contract: a null map throws
        // NullPointerException, signalling that callers are expected
        // to supply at least an empty map. A future refactor that
        // adds a null guard would need to update this test deliberately.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        assertThatThrownBy(() -> SslWarningCollector.collect(leaf, 365L, null))
            .isInstanceOf(NullPointerException.class);
    }

    @Test void empty_leafKey_map_is_safe_and_skips_key_check() {
        // The negative-space counterpart: an empty map (the minimum
        // valid input) must not throw, and the key check is skipped
        // because both "algorithm" and "bits" lookups return null.
        X509Certificate leaf = leafWithSig("SHA256withRSA");
        assertThat(SslWarningCollector.collect(leaf, 365L, new HashMap<>())).isEmpty();
    }

    /* ─── helpers ─────────────────────────────────────────────────────── */

    /**
     * Build a minimal map mimicking what the SSL inspector hands in:
     * the public-key algorithm name and the bit length. Production
     * adds more keys (modulus, exponent, etc.) but the collector
     * only inspects these two, so the test fixture pins to that.
     */
    private static Map<String, Object> rsaKey(int bits) {
        Map<String, Object> key = new HashMap<>();
        key.put("algorithm", "RSA");
        key.put("bits", bits);
        return key;
    }

    /**
     * Stub an X509Certificate that returns the given signature alg
     * name from getSigAlgName(). We use Mockito because building a
     * real cert with a specific sig alg is far more setup than the
     * collector needs to do its job.
     */
    private static X509Certificate leafWithSig(String sigAlg) {
        X509Certificate cert = mock(X509Certificate.class);
        when(cert.getSigAlgName()).thenReturn(sigAlg);
        return cert;
    }
}
