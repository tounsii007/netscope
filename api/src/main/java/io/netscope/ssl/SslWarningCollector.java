package io.netscope.ssl;

import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Aggregates user-visible "this cert has a problem" warnings the SSL
 * inspector surfaces alongside the raw data:
 *
 *   • Expiry runway   — <0 d expired, <14 d renew-today, <30 d renew-soon
 *   • Key strength    — RSA below 2048 bits
 *   • Signature alg   — MD5 or SHA-1 still in use
 *
 * Each rule is intentionally conservative; the inspector renders the
 * warnings list verbatim, so wording belongs here, not on the UI.
 */
public final class SslWarningCollector {

    private SslWarningCollector() {}

    public static List<String> collect(X509Certificate leaf, long daysLeft,
            Map<String, Object> leafKey) {
        List<String> warnings = new ArrayList<>();
        if (daysLeft < 0) {
            warnings.add("certificate has expired");
        } else if (daysLeft < 14) {
            warnings.add("certificate expires in " + daysLeft + " days");
        } else if (daysLeft < 30) {
            warnings.add("certificate expires in " + daysLeft + " days — renew soon");
        }
        String alg = String.valueOf(leafKey.get("algorithm"));
        Integer bits = (Integer) leafKey.get("bits");
        if ("RSA".equals(alg) && bits != null && bits < 2048) {
            warnings.add("RSA key < 2048 bits is considered weak");
        }
        String sig = leaf.getSigAlgName();
        if (sig != null && (sig.toLowerCase().contains("md5") || sig.toLowerCase().startsWith("sha1"))) {
            warnings.add("weak signature algorithm: " + sig);
        }
        return warnings;
    }
}
