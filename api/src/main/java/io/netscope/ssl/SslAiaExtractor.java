package io.netscope.ssl;

import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Pull Authority Information Access (AIA) URLs out of an X.509
 * certificate. Two flavours surface to the inspector response:
 *
 *   • {@code caIssuers} — URLs that serve the issuer's own cert,
 *     used by clients to repair broken chains.
 *   • {@code ocsp}      — OCSP responder URLs for revocation checks.
 *
 * Implemented as a byte-level scan over the raw DER octet string
 * (RFC 5280 §4.2.2.1). Avoids pulling in BouncyCastle just for this
 * one extension.
 *
 * <h3>Why byte-level and not JCE?</h3>
 * {@code X509Certificate.getExtensionValue("1.3.6.1.5.5.7.1.1")}
 * returns the raw octet string only — the JCE never decoded the
 * AccessDescription SEQUENCE for us. A handful of decoding patterns
 * (sun.security.x509 internals, BC, custom regex) are possible; the
 * scan-for-OID-prefix-and-URI-tag approach below is the smallest one
 * that handles both single and concatenated AccessDescription entries.
 *
 * @see io.netscope.ssl.SslControllerHelpersTest for the synthesised
 *      AIA-blob fixtures that pin the scanner's behaviour.
 */
public final class SslAiaExtractor {

    private SslAiaExtractor() {}

    public static Map<String, List<String>> extractFromCert(X509Certificate cert) {
        return extractFromOctets(cert.getExtensionValue("1.3.6.1.5.5.7.1.1"));
    }

    public static Map<String, List<String>> extractFromOctets(byte[] octets) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        if (octets == null) return out;
        List<String> ca = new ArrayList<>();
        List<String> ocsp = new ArrayList<>();
        scan(octets, ca, ocsp);
        if (!ca.isEmpty()) out.put("caIssuers", ca);
        if (!ocsp.isEmpty()) out.put("ocsp", ocsp);
        return out;
    }

    /**
     * Byte-level scan for the AIA AccessDescription pattern:
     * {@code 2B 06 01 05 05 07 30 <method> ... 86 <len> <url-bytes>}.
     *
     * The 7-byte OID prefix {@code 1.3.6.1.5.5.7.48} anchors the
     * search. The byte immediately after is the accessMethod
     * discriminator — {@code 0x01} for OCSP, {@code 0x02} for
     * caIssuers. We then skim forward to the next {@code "http"}
     * (the URL inside the GeneralName URI tag {@code 0x86}) and
     * read until a non-printable byte stops it — or until the
     * 7-byte OID prefix re-appears, marking the boundary between
     * concatenated AccessDescription entries.
     */
    private static void scan(byte[] octets, List<String> ca, List<String> ocsp) {
        final byte b0 = 0x2B, b1 = 0x06, b2 = 0x01, b3 = 0x05,
                   b4 = 0x05, b5 = 0x07, b6 = 0x30;
        int idx = 0;
        while (idx + 8 < octets.length) {
            if (octets[idx]     != b0 || octets[idx + 1] != b1
             || octets[idx + 2] != b2 || octets[idx + 3] != b3
             || octets[idx + 4] != b4 || octets[idx + 5] != b5
             || octets[idx + 6] != b6) {
                idx++;
                continue;
            }
            byte method = octets[idx + 7];
            int urlStart = findHttpStart(octets, idx + 8);
            if (urlStart < 0) return;
            int urlEnd = urlStart;
            while (urlEnd < octets.length
                && octets[urlEnd] > 0x20 && octets[urlEnd] < 0x7f
                && !isOidPrefixAt(octets, urlEnd, b0, b1, b2, b3, b4, b5, b6)) {
                urlEnd++;
            }
            String url = new String(octets, urlStart, urlEnd - urlStart,
                java.nio.charset.StandardCharsets.US_ASCII);
            if (method == 0x01) ocsp.add(url);
            else if (method == 0x02) ca.add(url);
            else ca.add(url);   // unknown discriminator → conservative bucket
            idx = urlEnd;
        }
    }

    private static int findHttpStart(byte[] octets, int from) {
        for (int j = from; j + 4 < octets.length; j++) {
            if (octets[j] == 'h' && octets[j + 1] == 't'
             && octets[j + 2] == 't' && octets[j + 3] == 'p') {
                return j;
            }
        }
        return -1;
    }

    /** True iff the 7-byte AIA OID prefix begins at {@code pos}. Halts
     *  URL extraction when a second AccessDescription is concatenated
     *  right after the first. {@code 0x2B} ({@code '+'}) is a valid URL
     *  character on its own, so the scanner can't stop on that byte
     *  alone — only when it starts the full OID-prefix run. */
    private static boolean isOidPrefixAt(byte[] o, int pos,
            byte b0, byte b1, byte b2, byte b3, byte b4, byte b5, byte b6) {
        return pos + 7 <= o.length
            && o[pos]     == b0 && o[pos + 1] == b1
            && o[pos + 2] == b2 && o[pos + 3] == b3
            && o[pos + 4] == b4 && o[pos + 5] == b5
            && o[pos + 6] == b6;
    }
}
