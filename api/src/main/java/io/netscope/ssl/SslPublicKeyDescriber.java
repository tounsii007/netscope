package io.netscope.ssl;

import java.security.PublicKey;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPublicKey;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * JSON-friendly description of an X.509 public key.
 *
 *   • RSA — algorithm + bit length
 *   • EC  — algorithm + field-size bits + curve name (e.g. "secp256r1")
 *   • everything else — only the algorithm name
 *
 * Returned shape keys map straight onto the {@code publicKeyAlgorithm
 * / publicKeyBits / publicKeyCurve} fields the SSL inspector emits,
 * so the UI rendering contract is stable across cert types.
 */
public final class SslPublicKeyDescriber {

    private SslPublicKeyDescriber() {}

    public static Map<String, Object> describe(PublicKey key) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("algorithm", key.getAlgorithm());
        if (key instanceof RSAPublicKey rsa) {
            m.put("bits", rsa.getModulus().bitLength());
        } else if (key instanceof ECPublicKey ec) {
            m.put("bits", ec.getParams().getCurve().getField().getFieldSize());
            // The curve OID isn't always exposed cleanly via JCE; fall
            // back to the toString() form which for named curves starts
            // with the standard name (e.g. "secp256r1 [NIST P-256] …").
            String params = ec.getParams().toString();
            int spaceIdx = params.indexOf(' ');
            m.put("curve", spaceIdx > 0 ? params.substring(0, spaceIdx) : params);
        }
        return m;
    }
}
