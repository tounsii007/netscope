package io.netscope.ssl;

import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;

/**
 * Decode X.509 Key Usage + Extended Key Usage extensions.
 *
 *   • {@link #describeKeyUsage(boolean[])} — bit array → conventional
 *     name list per RFC 5280 §4.2.1.3.
 *   • {@link #safeExtKeyUsage(X509Certificate)} — EKU OIDs as strings,
 *     never throws (legacy roots may omit the extension or carry a
 *     truncated DER blob).
 *
 * Both return empty lists for absent / malformed extensions; the
 * inspector treats "no extension" as the same UI signal as "explicitly
 * empty list".
 */
public final class SslKeyUsageDescriber {

    private SslKeyUsageDescriber() {}

    /**
     * Bit-array → name list. The first nine bits map to the standard
     * names below; anything beyond is silently ignored (RFC 5280 lets
     * future revisions extend the bit string, but the JDK only knows
     * about these nine and we follow suit).
     */
    public static List<String> describeKeyUsage(boolean[] bits) {
        if (bits == null) return List.of();
        String[] names = {
            "digitalSignature", "nonRepudiation", "keyEncipherment",
            "dataEncipherment", "keyAgreement", "keyCertSign",
            "cRLSign", "encipherOnly", "decipherOnly"
        };
        List<String> out = new ArrayList<>();
        for (int i = 0; i < bits.length && i < names.length; i++) {
            if (bits[i]) out.add(names[i]);
        }
        return out;
    }

    /** Extended Key Usage OIDs. Empty list on missing/malformed extension. */
    public static List<String> safeExtKeyUsage(X509Certificate cert) {
        try {
            List<String> eku = cert.getExtendedKeyUsage();
            return eku == null ? List.of() : eku;
        } catch (Exception e) {
            return List.of();
        }
    }
}
