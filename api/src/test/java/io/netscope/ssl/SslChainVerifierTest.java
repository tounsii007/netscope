package io.netscope.ssl;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.SignatureException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit coverage for {@link SslChainVerifier#chainSignedThrough} and
 * {@link SslChainVerifier#verifySignedBy}.
 *
 * The verifier is the cryptographic backstop that catches three
 * operational classes of broken-chain that a raw TLS handshake will
 * silently tolerate:
 *
 *   • Missing intermediate         (chain has gap → verify fails)
 *   • Wrong-order / swapped chain  (adjacent pair has wrong issuer)
 *   • Server shipped junk          (unrelated cert spliced in)
 *
 * What the verifier deliberately does NOT do — and what these tests
 * pin as the contract:
 *
 *   • Empty chain returns true (vacuous truth — there is nothing to
 *     verify). This matters because a TLS server is allowed by
 *     RFC 5246 §7.4.2 to omit the root, and some hand-rolled clients
 *     present a zero-length chain on connection failure; we must not
 *     report a spurious chain error in either case.
 *
 *   • The topmost cert is NOT required to be self-signed. Production
 *     servers almost always omit the root (the client already has it
 *     in its trust store; shipping it wastes bandwidth on every
 *     handshake). The JDK trust store handles whether the top link is
 *     anchored to a trusted CA — that's a separate concern.
 *
 *   • verifySignedBy swallows every exception by design. The X.509
 *     {@code verify} API throws across at least five exception types
 *     (InvalidKey, NoSuchAlgo, NoSuchProvider, Signature, Certificate)
 *     plus NPE for null public keys; the only signal we care about is
 *     "did it verify or not", so any throw is treated as "not". This
 *     is intentionally defensive — a malformed cert on the wire must
 *     not crash the inspector.
 */
class SslChainVerifierTest {

    /* ─── chainSignedThrough — boundary cases ──────────────────────────── */

    @Test void empty_chain_returns_true_vacuously() {
        // Length-0 input never enters the loop, so chainSignedThrough
        // returns true. Pinning so a future refactor that adds an
        // "isEmpty → false" guard can't silently flip the contract
        // and false-alarm every CA-less / zero-length chain.
        assertThat(SslChainVerifier.chainSignedThrough(new X509Certificate[0])).isTrue();
    }

    @Test void single_element_chain_returns_true_no_adjacent_pair() {
        // A one-cert chain has no adjacent pair to verify, so the
        // loop body never runs. Must still return true — pinning the
        // i+1 < length termination so a future "<=" slip would be
        // caught (and would index out of bounds).
        X509Certificate leaf = mock(X509Certificate.class);
        assertThat(SslChainVerifier.chainSignedThrough(new X509Certificate[]{leaf})).isTrue();
    }

    /* ─── chainSignedThrough — positive paths ──────────────────────────── */

    @Test void two_element_chain_returns_true_when_leaf_signed_by_intermediate() throws Exception {
        // The "happy path": [leaf, intermediate] where leaf.verify(int.pubkey)
        // succeeds. We stub verify() to no-throw, which the production
        // code treats as a successful verification.
        PublicKey pk = freshRsaPublicKey();
        X509Certificate intermediate = mock(X509Certificate.class);
        when(intermediate.getPublicKey()).thenReturn(pk);

        X509Certificate leaf = mock(X509Certificate.class);
        doNothing().when(leaf).verify(any(PublicKey.class));

        assertThat(SslChainVerifier.chainSignedThrough(
            new X509Certificate[]{leaf, intermediate})).isTrue();
    }

    @Test void three_element_chain_returns_true_when_both_adjacent_pairs_verify() throws Exception {
        // Pinning that the loop visits BOTH adjacent pairs and ANDs
        // their results — i.e. we don't short-circuit after the first
        // successful pair, which would let a broken upper link slip
        // through silently.
        PublicKey ipk = freshRsaPublicKey();
        PublicKey rpk = freshRsaPublicKey();

        X509Certificate intermediate = mock(X509Certificate.class);
        when(intermediate.getPublicKey()).thenReturn(ipk);
        doNothing().when(intermediate).verify(any(PublicKey.class));

        X509Certificate root = mock(X509Certificate.class);
        when(root.getPublicKey()).thenReturn(rpk);

        X509Certificate leaf = mock(X509Certificate.class);
        doNothing().when(leaf).verify(any(PublicKey.class));

        assertThat(SslChainVerifier.chainSignedThrough(
            new X509Certificate[]{leaf, intermediate, root})).isTrue();
    }

    /* ─── chainSignedThrough — negative paths ──────────────────────────── */

    @Test void two_element_chain_returns_false_when_leaf_not_signed_by_second_cert() throws Exception {
        // The "wrong-issuer" regression: server sent [leaf, unrelated]
        // — leaf.verify(unrelated.pubkey) throws SignatureException, so
        // chain returns false. This is the single most common
        // misconfiguration (admin pasted the wrong intermediate); the
        // verifier must catch it.
        PublicKey pk = freshRsaPublicKey();
        X509Certificate unrelated = mock(X509Certificate.class);
        when(unrelated.getPublicKey()).thenReturn(pk);

        X509Certificate leaf = mock(X509Certificate.class);
        doThrow(new SignatureException("not signed by this key"))
            .when(leaf).verify(any(PublicKey.class));

        assertThat(SslChainVerifier.chainSignedThrough(
            new X509Certificate[]{leaf, unrelated})).isFalse();
    }

    @Test void three_element_chain_returns_false_when_upper_pair_fails() throws Exception {
        // The loop-must-visit-every-pair invariant: [leaf, int, root]
        // where leaf→int verifies but int→root does NOT must return
        // false. If a future refactor breaks the loop and only checks
        // the first pair, this test catches it.
        PublicKey ipk = freshRsaPublicKey();
        PublicKey rpk = freshRsaPublicKey();

        X509Certificate intermediate = mock(X509Certificate.class);
        when(intermediate.getPublicKey()).thenReturn(ipk);
        doThrow(new SignatureException("intermediate not signed by root"))
            .when(intermediate).verify(any(PublicKey.class));

        X509Certificate root = mock(X509Certificate.class);
        when(root.getPublicKey()).thenReturn(rpk);

        X509Certificate leaf = mock(X509Certificate.class);
        doNothing().when(leaf).verify(any(PublicKey.class));

        assertThat(SslChainVerifier.chainSignedThrough(
            new X509Certificate[]{leaf, intermediate, root})).isFalse();
    }

    @Test void three_element_chain_returns_false_when_lower_pair_fails() throws Exception {
        // Mirror of the above: [leaf, int, root] where leaf→int FAILS
        // but int→root verifies. Must return false on the first failed
        // pair; pins early-termination is wired correctly (loop returns
        // immediately on false, doesn't keep checking and then somehow
        // overwrite the result).
        PublicKey ipk = freshRsaPublicKey();
        PublicKey rpk = freshRsaPublicKey();

        X509Certificate intermediate = mock(X509Certificate.class);
        when(intermediate.getPublicKey()).thenReturn(ipk);
        doNothing().when(intermediate).verify(any(PublicKey.class));

        X509Certificate root = mock(X509Certificate.class);
        when(root.getPublicKey()).thenReturn(rpk);

        X509Certificate leaf = mock(X509Certificate.class);
        doThrow(new SignatureException("leaf not signed by intermediate"))
            .when(leaf).verify(any(PublicKey.class));

        assertThat(SslChainVerifier.chainSignedThrough(
            new X509Certificate[]{leaf, intermediate, root})).isFalse();
    }

    /* ─── verifySignedBy — defensive-catch contract ────────────────────── */

    @Test void verifySignedBy_returns_false_when_parent_is_null() {
        // parent.getPublicKey() NPEs when parent is null. The
        // defensive catch must swallow that and return false rather
        // than propagating — the inspector must never crash on a
        // malformed chain handed over the wire.
        X509Certificate child = mock(X509Certificate.class);
        assertThat(SslChainVerifier.verifySignedBy(child, null)).isFalse();
    }

    @Test void verifySignedBy_returns_false_when_parent_publickey_is_null() throws Exception {
        // child.verify(null) throws NPE inside the JCE — defensive
        // catch must swallow and return false. Pinning the path
        // separately from the "parent is null" case because a
        // future "if (parent == null) return false" guard would
        // pass the first test but still NPE here.
        X509Certificate parent = mock(X509Certificate.class);
        when(parent.getPublicKey()).thenReturn(null);

        X509Certificate child = mock(X509Certificate.class);
        // Real child.verify(null) throws — we replicate that:
        doThrow(new NullPointerException("public key required"))
            .when(child).verify(any());

        assertThat(SslChainVerifier.verifySignedBy(child, parent)).isFalse();
    }

    @Test void verifySignedBy_returns_false_on_certificate_exception() throws Exception {
        // X509Certificate.verify() declares CertificateException among
        // its throws. The catch-Exception umbrella must cover it.
        PublicKey pk = freshRsaPublicKey();
        X509Certificate parent = mock(X509Certificate.class);
        when(parent.getPublicKey()).thenReturn(pk);

        X509Certificate child = mock(X509Certificate.class);
        doThrow(new CertificateException("malformed encoding"))
            .when(child).verify(any(PublicKey.class));

        assertThat(SslChainVerifier.verifySignedBy(child, parent)).isFalse();
    }

    @Test void verifySignedBy_returns_true_when_verify_does_not_throw() throws Exception {
        // The happy path — verify completes normally → method returns
        // true. The whole production class hangs off this contract.
        PublicKey pk = freshRsaPublicKey();
        X509Certificate parent = mock(X509Certificate.class);
        when(parent.getPublicKey()).thenReturn(pk);

        X509Certificate child = mock(X509Certificate.class);
        doNothing().when(child).verify(any(PublicKey.class));

        assertThat(SslChainVerifier.verifySignedBy(child, parent)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(classes = {
        SignatureException.class,
        CertificateException.class,
        java.security.InvalidKeyException.class,
        java.security.NoSuchAlgorithmException.class,
        java.security.NoSuchProviderException.class,
        RuntimeException.class
    })
    void verifySignedBy_returns_false_for_every_thrown_exception_type(Class<? extends Throwable> exType) throws Exception {
        // The X.509 verify API throws across at least five checked
        // exceptions plus RuntimeException; the catch (Exception)
        // umbrella must cover the entire family. Pinning each one
        // separately so a future "catch (SignatureException)"
        // narrowing would be caught by the parameterised expansion.
        PublicKey pk = freshRsaPublicKey();
        X509Certificate parent = mock(X509Certificate.class);
        when(parent.getPublicKey()).thenReturn(pk);

        X509Certificate child = mock(X509Certificate.class);
        Throwable ex = exType.getDeclaredConstructor(String.class).newInstance("boom");
        doThrow(ex).when(child).verify(any(PublicKey.class));

        assertThat(SslChainVerifier.verifySignedBy(child, parent)).isFalse();
    }

    /* ─── null-chain handling (negative-space) ─────────────────────────── */

    @Test void null_chain_throws_npe_callers_must_pass_non_null() {
        // The production code dereferences chain.length with no null
        // guard. We pin the current contract: a null chain throws NPE
        // — callers (the SSL controller) are expected to construct an
        // empty array, not pass null. A future refactor that adds a
        // null guard would need to update this test deliberately.
        assertThatThrownBy(() -> SslChainVerifier.chainSignedThrough(null))
            .isInstanceOf(NullPointerException.class);
    }

    /* ─── negative-space: don't accept what we shouldn't ───────────────── */

    @Test void chain_with_first_pair_swapped_is_rejected() {
        // The wrong-order regression in concrete form: an attacker
        // (or buggy server) might present [leaf, leaf] — leaf signed
        // by itself? No. Pinning that even the "leaf appears twice"
        // chain fails verification — leaf.verify(leaf.pubkey) is what
        // a SELF-SIGNED CERT does, which a leaf cert is decidedly not.
        // This is a negative-space proof we don't bless a degenerate
        // chain that an attacker could trivially construct.
        try {
            X509Certificate leaf = mock(X509Certificate.class);
            PublicKey pk = freshRsaPublicKey();
            when(leaf.getPublicKey()).thenReturn(pk);
            doThrow(new SignatureException("leaf is not its own CA"))
                .when(leaf).verify(any(PublicKey.class));

            assertThat(SslChainVerifier.chainSignedThrough(
                new X509Certificate[]{leaf, leaf})).isFalse();
        } catch (Exception e) {
            throw new AssertionError("setup failed", e);
        }
    }

    @Test void large_chain_with_one_broken_link_in_the_middle_is_rejected() throws Exception {
        // Adversarial-shape input: a long-looking chain (5 elements)
        // where the only broken pair is buried in the middle. Pinning
        // that the loop doesn't bail early on success and that
        // verification really does walk the whole chain — a regression
        // where the loop ran only the first or last pair would slip
        // an apparently-long but actually-broken chain through.
        PublicKey pk0 = freshRsaPublicKey();
        PublicKey pk1 = freshRsaPublicKey();
        PublicKey pk2 = freshRsaPublicKey();
        PublicKey pk3 = freshRsaPublicKey();

        X509Certificate c4 = mock(X509Certificate.class);
        when(c4.getPublicKey()).thenReturn(pk3);

        X509Certificate c3 = mock(X509Certificate.class);
        when(c3.getPublicKey()).thenReturn(pk2);
        doNothing().when(c3).verify(any(PublicKey.class));

        X509Certificate c2 = mock(X509Certificate.class);
        when(c2.getPublicKey()).thenReturn(pk1);
        // The broken middle link:
        doThrow(new SignatureException("middle of chain broken"))
            .when(c2).verify(any(PublicKey.class));

        X509Certificate c1 = mock(X509Certificate.class);
        when(c1.getPublicKey()).thenReturn(pk0);
        doNothing().when(c1).verify(any(PublicKey.class));

        X509Certificate c0 = mock(X509Certificate.class);
        doNothing().when(c0).verify(any(PublicKey.class));

        assertThat(SslChainVerifier.chainSignedThrough(
            new X509Certificate[]{c0, c1, c2, c3, c4})).isFalse();
    }

    /* ─── exception-safety: never propagate ────────────────────────────── */

    @Test void verifySignedBy_never_propagates_even_unchecked_exceptions() throws Exception {
        // Defensive-catch contract part 2: even RuntimeException (which
        // the JDK wouldn't normally throw from verify, but a buggy
        // security provider could) must be swallowed. Pinning so a
        // future "catch (GeneralSecurityException)" narrowing would
        // accidentally let runtime exceptions escape.
        PublicKey pk = freshRsaPublicKey();
        X509Certificate parent = mock(X509Certificate.class);
        when(parent.getPublicKey()).thenReturn(pk);

        X509Certificate child = mock(X509Certificate.class);
        doThrow(new IllegalStateException("provider in bad state"))
            .when(child).verify(any(PublicKey.class));

        assertThatCode(() -> SslChainVerifier.verifySignedBy(child, parent))
            .doesNotThrowAnyException();
        assertThat(SslChainVerifier.verifySignedBy(child, parent)).isFalse();
    }

    /* ─── helpers ─────────────────────────────────────────────────────── */

    /**
     * Generate a real RSA public key for stubbing parent.getPublicKey().
     * We use a real key (rather than a mock) because the production
     * code passes it straight into X509Certificate.verify(), and a
     * mocked PublicKey can cause Mockito's any() matchers to behave
     * unpredictably across Mockito versions. 2048 bits is the smallest
     * size the JDK accepts without a warning; we don't actually use
     * the key for signature math here.
     */
    private static PublicKey freshRsaPublicKey() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair kp = kpg.generateKeyPair();
        return kp.getPublic();
    }
}
