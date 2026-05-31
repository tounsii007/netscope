package io.netscope.ssl;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.ECField;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.EllipticCurve;
import java.security.spec.ECGenParameterSpec;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit coverage for {@link SslPublicKeyDescriber#describe}.
 *
 * The describer is the only place that translates raw JCE PublicKey
 * shapes into the JSON the UI renders. The wire contract pinned here:
 *
 *   • Map insertion order is "algorithm" first, then "bits" (then
 *     "curve" for EC). LinkedHashMap is load-bearing because the
 *     frontend reads the object as a fixed-shape DTO — a JSON-shape
 *     regression that swaps key order or adds/removes keys would
 *     either misalign the SSL inspector card or break a property-
 *     based contract test downstream.
 *
 *   • RSA-only path emits {algorithm, bits} from the modulus length;
 *     EC path emits {algorithm, bits, curve} from the field size +
 *     named-curve toString prefix.
 *
 *   • Any other algorithm (DSA, Ed25519, X25519, etc.) emits ONLY
 *     {algorithm} — no fabricated bits/curve. The warning collector
 *     downstream relies on this to skip its weak-key check via a
 *     null-check on the bits entry.
 */
class SslPublicKeyDescriberTest {

    /* ─── RSA path ────────────────────────────────────────────────────── */

    @Test void rsa_2048_returns_algorithm_then_bits_in_order() {
        // Pins the exact wire shape for the most common case (LE-issued
        // 2048-bit RSA leaf). The map MUST be {algorithm:'RSA', bits:2048}
        // with algorithm first and bits second — the LinkedHashMap order
        // matters because the UI reads JSON.stringify output verbatim,
        // and any shape regression that flips order or sprouts an extra
        // key (e.g. accidental "curve":null on the RSA path) would
        // misalign the SSL inspector card.
        Map<String, Object> result = SslPublicKeyDescriber.describe(freshRsaKey(2048));

        assertThat(result)
            .containsExactly(
                java.util.Map.entry("algorithm", "RSA"),
                java.util.Map.entry("bits", 2048)
            );
    }

    @Test void rsa_4096_reads_bit_length_from_modulus_not_hardcoded() {
        // 4096 specifically proves the implementation reads
        // rsa.getModulus().bitLength() instead of returning a hardcoded
        // 2048 (which would be a subtle regression after a refactor
        // that "simplified" the bit lookup).
        Map<String, Object> result = SslPublicKeyDescriber.describe(freshRsaKey(4096));

        assertThat(result).containsEntry("bits", 4096);
        assertThat(result).containsEntry("algorithm", "RSA");
        // No curve key on RSA path — negative space.
        assertThat(result).doesNotContainKey("curve");
    }

    @Test void rsa_3072_uneven_size_proves_bitlength_reads_actual_modulus() {
        // 3072 is an uneven size (not a power of two times 1024) — pins
        // that the bit count flows from the modulus, not from any
        // bit-pattern check on the algorithm string. Also keeps coverage
        // of an NSA Suite-B-style intermediate size.
        Map<String, Object> result = SslPublicKeyDescriber.describe(freshRsaKey(3072));

        assertThat(result).containsEntry("bits", 3072);
    }

    /* ─── EC path ─────────────────────────────────────────────────────── */

    @Test void ec_secp256r1_returns_algorithm_bits_curve_in_order() {
        // Pins the EC wire shape: {algorithm:'EC', bits:256, curve:...}
        // with all three keys in the documented insertion order. We
        // assert curve via startsWith because the JDK's ECParameterSpec
        // toString format varies across JDK versions (the prefix is
        // stable but the trailing "[NIST P-256, X9.62 ...] (oid)" is not).
        Map<String, Object> result = SslPublicKeyDescriber.describe(freshEcKey("secp256r1"));

        assertThat(result.keySet()).containsExactly("algorithm", "bits", "curve");
        assertThat(result).containsEntry("algorithm", "EC");
        assertThat(result).containsEntry("bits", 256);
        assertThat((String) result.get("curve")).startsWith("secp256r1");
    }

    @Test void ec_secp384r1_field_size_reads_from_curve_not_hardcoded_for_p256() {
        // P-384 proves the field-size lookup flows through
        // ec.getParams().getCurve().getField().getFieldSize() and isn't
        // hardcoded to 256 (which would be the "always P-256" regression).
        Map<String, Object> result = SslPublicKeyDescriber.describe(freshEcKey("secp384r1"));

        assertThat(result).containsEntry("bits", 384);
        assertThat(result).containsEntry("algorithm", "EC");
        assertThat((String) result.get("curve")).startsWith("secp384r1");
    }

    @Test void ec_secp521r1_field_size_521_not_512_proves_real_field_read() {
        // P-521 is the adversarial size: 521 bits, NOT 512. If anyone
        // ever refactors the field-size to a power-of-two assumption,
        // this test catches it. Also doubles as the largest-curve case.
        Map<String, Object> result = SslPublicKeyDescriber.describe(freshEcKey("secp521r1"));

        assertThat(result).containsEntry("bits", 521);
    }

    /* ─── EC degenerate-toString edge case ────────────────────────────── */

    @Test void ec_params_with_no_space_in_toString_falls_back_to_full_string() {
        // The implementation uses indexOf(' ') and substring(0, spaceIdx)
        // — if the JCE provider ever returns an ECParameterSpec whose
        // toString() has no space (e.g. a single bare OID), we MUST NOT
        // throw IndexOutOfBoundsException. The guard is
        // `spaceIdx > 0 ? substring : params` so the full string is
        // used as the curve name. Pinning the guard here so a future
        // "trust the substring index" refactor can't strip it.
        PublicKey degenerate = new ECPublicKey() {
            @Override public java.security.spec.ECPoint getW() { return null; }
            @Override public ECParameterSpec getParams() { return SPACE_LESS_PARAMS; }
            @Override public String getAlgorithm() { return "EC"; }
            @Override public String getFormat() { return "X.509"; }
            @Override public byte[] getEncoded() { return new byte[0]; }
        };

        Map<String, Object> result = SslPublicKeyDescriber.describe(degenerate);

        assertThat(result).containsEntry("algorithm", "EC");
        assertThat(result).containsEntry("bits", 192); // field size of stub
        assertThat(result).containsEntry("curve", SPACE_LESS_PARAMS.toString());
        // Pin the negative: must not contain a substring with leading/
        // trailing space that would imply the indexOf(' ') accidentally
        // matched a non-existent space.
        assertThat((String) result.get("curve")).doesNotContain(" ");
    }

    @Test void ec_params_with_space_at_index_zero_falls_back_to_full_string() {
        // Adversarial: a leading-space toString would give spaceIdx == 0,
        // and the guard is `> 0` not `>= 0` — so this also falls into
        // the fallback "use the whole string" branch. Pins that the
        // guard is strict (>) so an off-by-one would surface here.
        ECParameterSpec leadingSpace = new ECParameterSpec(
            new EllipticCurve(new java.security.spec.ECFieldFp(BigInteger.valueOf(23)),
                BigInteger.ONE, BigInteger.ONE),
            new ECPoint(BigInteger.ONE, BigInteger.ONE),
            BigInteger.valueOf(23),
            1) {
            @Override public String toString() { return " curve-with-leading-space"; }
        };
        PublicKey leading = new ECPublicKey() {
            @Override public java.security.spec.ECPoint getW() { return null; }
            @Override public ECParameterSpec getParams() { return leadingSpace; }
            @Override public String getAlgorithm() { return "EC"; }
            @Override public String getFormat() { return "X.509"; }
            @Override public byte[] getEncoded() { return new byte[0]; }
        };

        Map<String, Object> result = SslPublicKeyDescriber.describe(leading);

        // spaceIdx == 0 falls through the `> 0` guard, so the curve is
        // the raw full string (leading space preserved).
        assertThat(result).containsEntry("curve", " curve-with-leading-space");
    }

    /* ─── non-RSA / non-EC path ───────────────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {"Ed25519", "X25519", "DSA", "RSASSA-PSS", "Ed448"})
    void non_rsa_non_ec_algorithm_emits_only_algorithm_key(String algorithmName) {
        // The describer must return only {algorithm:<name>} for any
        // key that is neither RSAPublicKey nor ECPublicKey. The
        // downstream warning collector relies on the ABSENCE of a
        // "bits" entry to skip its weak-RSA check (its null-check on
        // bits is exercised by exactly this shape). Several names
        // pinned to cover the modern + legacy long tail.
        PublicKey opaque = new PublicKey() {
            @Override public String getAlgorithm() { return algorithmName; }
            @Override public String getFormat() { return "X.509"; }
            @Override public byte[] getEncoded() { return new byte[0]; }
        };

        Map<String, Object> result = SslPublicKeyDescriber.describe(opaque);

        assertThat(result).containsExactly(
            java.util.Map.entry("algorithm", algorithmName)
        );
        // Negative space: explicit assert that neither "bits" nor
        // "curve" leaked into the map. Pins that the RSA / EC
        // branches don't accidentally fall through.
        assertThat(result).doesNotContainKeys("bits", "curve");
    }

    /* ─── null + adversarial input shapes ─────────────────────────────── */

    @Test void null_key_throws_npe_signalling_caller_must_pre_check() {
        // The implementation calls key.getAlgorithm() with no null
        // guard, so describe(null) throws NPE. Pin the current
        // contract: callers in the SSL inspector path are responsible
        // for not passing null (the JCE cert API guarantees non-null
        // here). A future refactor that adds a null guard would need
        // to update this test deliberately.
        assertThatThrownBy(() -> SslPublicKeyDescriber.describe(null))
            .isInstanceOf(NullPointerException.class);
    }

    @Test void rsa_key_with_empty_algorithm_name_still_returns_canonical_shape() {
        // A pathological RSAPublicKey whose getAlgorithm() returns "" —
        // the describer must still emit both algorithm AND bits (the
        // RSA-branch dispatch is `instanceof`, not a name compare).
        // Pins that the type-test dispatch isn't accidentally replaced
        // with a "if RSA".equals(name) string compare in a refactor.
        RSAPublicKey weird = new RSAPublicKey() {
            @Override public BigInteger getModulus() {
                return BigInteger.ONE.shiftLeft(2048).subtract(BigInteger.ONE);
            }
            @Override public BigInteger getPublicExponent() { return BigInteger.valueOf(65537); }
            @Override public String getAlgorithm() { return ""; }
            @Override public String getFormat() { return "X.509"; }
            @Override public byte[] getEncoded() { return new byte[0]; }
        };

        Map<String, Object> result = SslPublicKeyDescriber.describe(weird);

        assertThat(result).containsEntry("algorithm", "");
        assertThat(result).containsEntry("bits", 2048);
    }

    /* ─── negative-space: shape does not over-emit ────────────────────── */

    @Test void rsa_path_never_emits_curve_key_negative_space() {
        // Negative space: the curve key is the exclusive marker of an
        // EC public key. If the RSA branch ever accidentally added a
        // "curve" entry (e.g. via a copy-paste mistake during refactor),
        // the UI would render a meaningless curve string for every
        // RSA-signed site. Pinning explicitly.
        Map<String, Object> result = SslPublicKeyDescriber.describe(freshRsaKey(2048));

        assertThat(result).doesNotContainKey("curve");
        assertThat(result).hasSize(2);
    }

    @Test void ec_path_never_emits_extra_keys_beyond_algorithm_bits_curve() {
        // Negative space: the EC branch must emit exactly three keys.
        // If a future "include OID" / "include format" addition leaks
        // here without updating the wire contract, the UI's typed JSON
        // parsing in the frontend would throw an "unexpected field"
        // error. Pinning the size and the exact key set.
        Map<String, Object> result = SslPublicKeyDescriber.describe(freshEcKey("secp256r1"));

        assertThat(result).hasSize(3);
        assertThat(result.keySet()).containsExactly("algorithm", "bits", "curve");
    }

    @Test void returned_map_is_a_linkedhashmap_for_stable_insertion_order() {
        // The contract is documented as "LinkedHashMap insertion order"
        // because downstream JSON serialisers iterate the entrySet().
        // Pinning the concrete type so a future "return Map.of(...)"
        // refactor (which would lose insertion-order guarantee) is
        // caught here rather than at JSON-shape-test time downstream.
        Map<String, Object> result = SslPublicKeyDescriber.describe(freshRsaKey(2048));

        assertThat(result).isInstanceOf(LinkedHashMap.class);
    }

    /* ─── helpers ─────────────────────────────────────────────────────── */

    /**
     * Generate a real RSA public key at the given bit length. We use
     * a real KeyPairGenerator (not a Mockito stub) because the describer
     * dispatches via {@code instanceof RSAPublicKey} — a mocked
     * RSAPublicKey works but a real one keeps the test honest about
     * the modulus + bit-length contract.
     */
    private static PublicKey freshRsaKey(int bits) {
        try {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
            kpg.initialize(bits);
            KeyPair kp = kpg.generateKeyPair();
            return kp.getPublic();
        } catch (Exception e) {
            throw new AssertionError("RSA keygen failed for " + bits + " bits", e);
        }
    }

    /**
     * Generate a real EC public key on the given named curve. Same
     * rationale as freshRsaKey: real ECPublicKey keeps the field-size
     * + named-curve toString assertions honest against the JDK's
     * actual SunEC output rather than a hand-stubbed approximation.
     */
    private static PublicKey freshEcKey(String curveName) {
        try {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
            kpg.initialize(new ECGenParameterSpec(curveName));
            KeyPair kp = kpg.generateKeyPair();
            return kp.getPublic();
        } catch (Exception e) {
            throw new AssertionError("EC keygen failed for " + curveName, e);
        }
    }

    /**
     * An ECParameterSpec whose toString() deliberately contains no
     * space character. Used to exercise the {@code spaceIdx > 0 ?
     * substring : params} fallback in the describer. The curve /
     * generator values themselves are nonsense (they have to be
     * non-null because ECParameterSpec rejects null), but the
     * describer only reads getCurve().getField().getFieldSize() and
     * the toString() — so as long as those are sane we're good.
     */
    private static final ECParameterSpec SPACE_LESS_PARAMS = new ECParameterSpec(
        new EllipticCurve(
            new java.security.spec.ECFieldFp(BigInteger.ONE.shiftLeft(192).subtract(BigInteger.ONE)),
            BigInteger.ONE,
            BigInteger.ONE),
        new ECPoint(BigInteger.ONE, BigInteger.ONE),
        BigInteger.valueOf(7),
        1) {
        @Override public String toString() {
            return "curvenospace";
        }
    };
}
