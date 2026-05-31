package io.netscope.ssl;

import java.security.cert.X509Certificate;

/**
 * Cryptographic checks over a presented TLS certificate chain.
 *
 *   • {@link #verifySignedBy} — does this cert verify against the
 *     given parent's public key?
 *   • {@link #chainSignedThrough} — is every adjacent pair in the
 *     presented chain verifiable?
 *
 * Captures the operational mistakes a TLS handshake silently
 * tolerates: missing intermediates, wrong-order chain, swapped
 * issuer. The JDK trust-store handles the orthogonal question of
 * whether the topmost link is rooted in a trusted CA.
 *
 * Notably DOES NOT require the chain to terminate in a self-signed
 * root — RFC 5246 §7.4.2 explicitly allows omitting the root, and
 * most production servers do (clients already have the trust store;
 * shipping the root wastes bandwidth on every handshake).
 */
public final class SslChainVerifier {

    private SslChainVerifier() {}

    /** Returns true iff {@code child.verify(parent.publicKey)} succeeds. */
    public static boolean verifySignedBy(X509Certificate child, X509Certificate parent) {
        try {
            child.verify(parent.getPublicKey());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** True when every adjacent pair in {@code chain} verifies. */
    public static boolean chainSignedThrough(X509Certificate[] chain) {
        for (int i = 0; i + 1 < chain.length; i++) {
            if (!verifySignedBy(chain[i], chain[i + 1])) return false;
        }
        return true;
    }
}
