package io.netscope.dkim;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * Decodes a base64-encoded DKIM public key into algorithm + bit-size.
 *
 * Handles the two algorithms in active deployment:
 *   • RSA (RFC 6376) — X.509 SubjectPublicKeyInfo, variable size
 *   • Ed25519 (RFC 8463) — fixed 256-bit, no JCE KeyFactory needed
 *
 * Whitespace in the base64 body is stripped because some DNS providers
 * chunk long TXT records with embedded spaces that survive
 * concatenation downstream.
 */
public final class DkimKeyDecoder {
    private DkimKeyDecoder() {}

    /** Algorithm + bit-length pair returned by {@link #decode}. */
    public record PubKeyInfo(String algorithm, int bits) {}

    public static PubKeyInfo decode(String base64, String keyType) throws Exception {
        byte[] bytes = Base64.getDecoder().decode(base64.replaceAll("\\s+", ""));
        if ("ed25519".equalsIgnoreCase(keyType)) {
            return new PubKeyInfo("Ed25519", 256);
        }
        KeyFactory kf = KeyFactory.getInstance("RSA");
        PublicKey pub = kf.generatePublic(new X509EncodedKeySpec(bytes));
        int bits = (pub instanceof RSAPublicKey rsa) ? rsa.getModulus().bitLength() : -1;
        return new PubKeyInfo("RSA", bits);
    }
}
