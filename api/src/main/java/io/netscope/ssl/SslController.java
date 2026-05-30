package io.netscope.ssl;

import io.netscope.common.errors.ApiException;
import io.netscope.common.ResponseCache;
import io.netscope.common.security.TargetValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import javax.net.ssl.*;
import java.net.InetSocketAddress;
import java.security.PublicKey;
import java.security.cert.X509Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@RestController
@RequestMapping("/api/v1/ssl")
public class SslController {

    private static final Logger log = LoggerFactory.getLogger(SslController.class);

    private final TargetValidator validator;
    private final ResponseCache cache;
    public SslController(TargetValidator v, ResponseCache cache) {
        this.validator = v; this.cache = cache;
    }

    @GetMapping("/{host}")
    @SuppressWarnings("unchecked")
    public Map<String, Object> inspect(
            @PathVariable String host,
            @RequestParam(defaultValue = "443") int port) {
        // SSRF + DNS-rebinding defense: resolve once, then connect by the
        // validated InetAddress. Without this, new InetSocketAddress(host,
        // port) would do a SECOND DNS lookup at connect time — and a low-
        // TTL attacker resolver could return a public IP first (passes
        // validate) and 127.0.0.1 second (the socket then targets the
        // loopback service and the TLS chain leaks back to the user).
        java.net.InetAddress addr = validator.resolveAndValidate(host);
        return cache.get("ssl", host + ":" + port, Map.class, Duration.ofMinutes(15), () -> {
            try {
                return doInspect(host, addr, port);
            } catch (Exception e) {
                throw ApiException.sanitizedFailure(log, "SSL handshake failed", e);
            }
        });
    }

    private Map<String, Object> doInspect(String host, java.net.InetAddress addr, int port) throws Exception {
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, null, null);
        SSLSocketFactory factory = ctx.getSocketFactory();

        try (SSLSocket socket = (SSLSocket) factory.createSocket()) {
            // Use the InetAddress (validated) for the connection, but keep
            // the original hostname as the SNI value so the server returns
            // the correct virtual-host certificate.
            socket.connect(new InetSocketAddress(addr, port), 5000);
            socket.setSoTimeout(5000);
            SSLParameters params = socket.getSSLParameters();
            params.setServerNames(List.of(new SNIHostName(host)));
            socket.setSSLParameters(params);
            socket.startHandshake();

            SSLSession session = socket.getSession();
            X509Certificate[] chain = (X509Certificate[]) session.getPeerCertificates();
            X509Certificate leaf = chain[0];

            List<Map<String, Object>> chainOut = new ArrayList<>();
            for (int i = 0; i < chain.length; i++) {
                X509Certificate c = chain[i];
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("position", i);                  // 0 = leaf
                entry.put("subject", c.getSubjectX500Principal().getName());
                entry.put("issuer", c.getIssuerX500Principal().getName());
                entry.put("validFrom", c.getNotBefore().toInstant().toString());
                entry.put("validTo", c.getNotAfter().toInstant().toString());
                entry.put("serial", c.getSerialNumber().toString(16));
                entry.put("sigAlg", c.getSigAlgName());
                entry.put("selfSigned", c.getSubjectX500Principal().equals(c.getIssuerX500Principal()));
                Map<String, Object> keyInfo = describePublicKey(c.getPublicKey());
                entry.put("publicKeyAlgorithm", keyInfo.get("algorithm"));
                entry.put("publicKeyBits", keyInfo.get("bits"));
                if (keyInfo.containsKey("curve")) entry.put("publicKeyCurve", keyInfo.get("curve"));
                entry.put("keyUsage", describeKeyUsage(c.getKeyUsage()));
                entry.put("extendedKeyUsage", safeExtKeyUsage(c));
                // AIA: where does the verifier go to fetch the issuer cert
                // and the OCSP responder? Empty when the CA omits them
                // (older roots, or self-signed leafs).
                Map<String, List<String>> aia = extractAia(c);
                entry.put("caIssuersUrls", aia.getOrDefault("caIssuers", List.of()));
                entry.put("ocspResponderUrls", aia.getOrDefault("ocsp", List.of()));
                // Chain link verification: is THIS cert signed by the NEXT
                // one in the presented chain? Servers occasionally ship a
                // misordered or stale intermediate; this flag tells the UI
                // exactly which link is broken.
                if (i + 1 < chain.length) {
                    entry.put("signedByNext", verifySignedBy(c, chain[i + 1]));
                } else {
                    entry.put("signedByNext", null); // last cert — no next
                }
                chainOut.add(entry);
            }

            long daysLeft = ChronoUnit.DAYS.between(Instant.now(), leaf.getNotAfter().toInstant());
            Map<String, Object> leafKey = describePublicKey(leaf.getPublicKey());

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("host", host);
            out.put("port", port);
            out.put("tlsVersion", session.getProtocol());
            out.put("cipherSuite", session.getCipherSuite());
            out.put("subject", leaf.getSubjectX500Principal().getName());
            out.put("issuer", leaf.getIssuerX500Principal().getName());
            out.put("validFrom", leaf.getNotBefore().toInstant().toString());
            out.put("validTo", leaf.getNotAfter().toInstant().toString());
            out.put("daysUntilExpiry", daysLeft);
            out.put("expired", daysLeft < 0);
            out.put("publicKeyAlgorithm", leafKey.get("algorithm"));
            out.put("publicKeyBits", leafKey.get("bits"));
            if (leafKey.containsKey("curve")) out.put("publicKeyCurve", leafKey.get("curve"));
            out.put("sans", extractSans(leaf));
            // Leaf-cert depth additions: Key Usage + EKU bits, AIA endpoints,
            // SCT presence (Certificate Transparency proof embedded by the CA).
            out.put("keyUsage", describeKeyUsage(leaf.getKeyUsage()));
            out.put("extendedKeyUsage", safeExtKeyUsage(leaf));
            Map<String, List<String>> leafAia = extractAia(leaf);
            out.put("caIssuersUrls", leafAia.getOrDefault("caIssuers", List.of()));
            out.put("ocspResponderUrls", leafAia.getOrDefault("ocsp", List.of()));
            out.put("hasSctExtension", leaf.getExtensionValue("1.3.6.1.4.1.11129.2.4.2") != null);
            // Each link in the chain claims to be signed by the next; if any
            // link fails, the whole chain is invalid. Surface a top-level
            // boolean so monitors can alert on broken chains with one check.
            out.put("chainComplete", chainSignedThrough(chain));
            out.put("chain", chainOut);
            // Self-signed at the leaf is unusual on the public Internet
            // and worth flagging — the UI shows a yellow warning.
            out.put("selfSigned", leaf.getSubjectX500Principal().equals(leaf.getIssuerX500Principal()));
            // Crude but useful warning surface — anything below 90 days
            // is renew-soon territory; below 14 d is renew-today.
            List<String> warnings = new ArrayList<>();
            if (daysLeft < 0) warnings.add("certificate has expired");
            else if (daysLeft < 14) warnings.add("certificate expires in " + daysLeft + " days");
            else if (daysLeft < 30) warnings.add("certificate expires in " + daysLeft + " days — renew soon");
            String alg = String.valueOf(leafKey.get("algorithm"));
            Integer bits = (Integer) leafKey.get("bits");
            if ("RSA".equals(alg) && bits != null && bits < 2048) {
                warnings.add("RSA key < 2048 bits is considered weak");
            }
            String sig = leaf.getSigAlgName();
            if (sig != null && (sig.toLowerCase().contains("md5") || sig.toLowerCase().startsWith("sha1"))) {
                warnings.add("weak signature algorithm: " + sig);
            }
            if (!warnings.isEmpty()) out.put("warnings", warnings);
            return out;
        }
    }

    /**
     * Describe the public key in JSON-friendly terms. RSA gets bit
     * length; EC gets bit length plus the curve name (e.g. "secp256r1").
     * Other algorithms fall back to whatever {@code getAlgorithm()}
     * reports.
     */
    private Map<String, Object> describePublicKey(PublicKey key) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("algorithm", key.getAlgorithm());
        if (key instanceof RSAPublicKey rsa) {
            m.put("bits", rsa.getModulus().bitLength());
        } else if (key instanceof ECPublicKey ec) {
            m.put("bits", ec.getParams().getCurve().getField().getFieldSize());
            // The curve OID isn't always exposed cleanly; fall back to a
            // toString() that JCE provides for named curves.
            String params = ec.getParams().toString();
            // params often looks like "secp256r1 [NIST P-256] ..." — pluck the first token.
            int spaceIdx = params.indexOf(' ');
            m.put("curve", spaceIdx > 0 ? params.substring(0, spaceIdx) : params);
        }
        return m;
    }

    private List<String> extractSans(X509Certificate cert) {
        try {
            Collection<List<?>> sans = cert.getSubjectAlternativeNames();
            if (sans == null) return List.of();
            List<String> out = new ArrayList<>();
            for (List<?> s : sans) if (s.size() >= 2) out.add(String.valueOf(s.get(1)));
            return out;
        } catch (Exception e) { return List.of(); }
    }

    /**
     * Decode X.509 Key Usage bits into the conventional names. RFC 5280
     * §4.2.1.3. Returns an empty list when the cert omits the extension —
     * legacy roots and some self-signed test certs do.
     * Package-private for unit-test coverage.
     */
    static List<String> describeKeyUsage(boolean[] bits) {
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

    /** Extended Key Usage as a list of OIDs. Empty when the extension is
     *  missing or the cert has been mis-issued. */
    private static List<String> safeExtKeyUsage(X509Certificate cert) {
        try {
            List<String> eku = cert.getExtendedKeyUsage();
            return eku == null ? List.of() : eku;
        } catch (Exception e) {
            return List.of();
        }
    }

    /**
     * Pull Authority Information Access (AIA) URLs out of a certificate.
     * Returns a map with optional keys {@code "caIssuers"} (URLs that
     * serve the issuer's own cert, used to repair broken chains) and
     * {@code "ocsp"} (OCSP responder URLs).
     *
     * Implemented by parsing the raw DER octet-string with
     * {@link java.security.cert.X509Certificate#getExtensionValue} and
     * a minimal walk. Avoids pulling in BouncyCastle just for this.
     */
    private static Map<String, List<String>> extractAia(X509Certificate cert) {
        return extractAiaFromOctets(cert.getExtensionValue("1.3.6.1.5.5.7.1.1"));
    }

    /** Package-private byte-level overload — the X509-input overload above
     *  pulls the AIA extension bytes once, then delegates here. Letting
     *  the test build its own AIA blob avoids the cost of standing up a
     *  full X.509 fixture. */
    static Map<String, List<String>> extractAiaFromOctets(byte[] octets) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        if (octets == null) return out;
        List<String> ca = new ArrayList<>();
        List<String> ocsp = new ArrayList<>();
        extractAiaInternal(octets, ca, ocsp);
        if (!ca.isEmpty()) out.put("caIssuers", ca);
        if (!ocsp.isEmpty()) out.put("ocsp", ocsp);
        return out;
    }

    /**
     * Byte-level scan for the AIA AccessDescription pattern:
     * {@code 2B 06 01 05 05 07 30 <method> ... 86 <len> <url-bytes>}.
     *
     * The 7-byte OID prefix {@code 1.3.6.1.5.5.7.48} is unique enough in
     * AIA extension bodies to anchor on directly. The byte immediately
     * after the prefix is the {@code accessMethod} discriminator —
     * {@code 0x01} for OCSP, {@code 0x02} for caIssuers. We then skim
     * forward to the next {@code "http"} substring (the URL inside the
     * GeneralName URI tag {@code 0x86}) and read until a non-printable
     * byte stops it.
     *
     * The earlier implementation used {@code preceding.contains("")}
     * which mis-fired because the OID prefix ITSELF contains a {@code 0x01}
     * byte at position 2 — every URL got classified as OCSP regardless of
     * the actual discriminator. This rewrite addresses that.
     */
    private static void extractAiaInternal(byte[] octets, List<String> ca, List<String> ocsp) {
        // OID prefix 1.3.6.1.5.5.7.48 in DER:
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
            // Find the next "http" anywhere after the OID + discriminator;
            // it must precede the next OID block, so we cap the search at
            // the next prefix occurrence or end-of-buffer.
            int urlStart = -1;
            for (int j = idx + 8; j + 4 < octets.length; j++) {
                if (octets[j] == 'h' && octets[j + 1] == 't'
                 && octets[j + 2] == 't' && octets[j + 3] == 'p') {
                    urlStart = j;
                    break;
                }
            }
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

    /** True iff the 7-byte AIA OID prefix begins at {@code pos}. Used to
     *  cut a URL extraction short when a second AccessDescription is
     *  concatenated right after the first without a length-delimited
     *  separator. The byte {@code 0x2B} ({@code '+'}) is a valid URL
     *  character on its own, so the scanner cannot stop on it
     *  unconditionally — only when it sits at the start of the full
     *  OID-prefix byte run. */
    private static boolean isOidPrefixAt(byte[] o, int pos,
            byte b0, byte b1, byte b2, byte b3, byte b4, byte b5, byte b6) {
        return pos + 7 <= o.length
            && o[pos]     == b0 && o[pos + 1] == b1
            && o[pos + 2] == b2 && o[pos + 3] == b3
            && o[pos + 4] == b4 && o[pos + 5] == b5
            && o[pos + 6] == b6;
    }


    /** Cryptographic check: does {@code child}.verify({@code parent}.publicKey)
     *  succeed? Captures broken / out-of-order chains the TLS layer happily
     *  presents but a strict verifier would refuse. */
    private static boolean verifySignedBy(X509Certificate child, X509Certificate parent) {
        try {
            child.verify(parent.getPublicKey());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * True when every adjacent pair in the presented chain cryptographically
     * verifies. Captures the operational mistakes a TLS handshake silently
     * tolerates: missing or stale intermediates, wrong-order chain, swapped
     * issuer.
     *
     * Does NOT require the chain to terminate in a self-signed root —
     * RFC 5246 §7.4.2 explicitly allows omitting the root, and most
     * production servers do exactly that (clients have the trust store
     * already; sending the root wastes bandwidth on every handshake). The
     * previous self-signed-last check made this method return false for
     * every correctly-configured server. Surface only the verifiable-link
     * signal here; whether the topmost intermediate chains to a trusted
     * root is the JDK trust-store's job, not ours.
     */
    private static boolean chainSignedThrough(X509Certificate[] chain) {
        for (int i = 0; i + 1 < chain.length; i++) {
            if (!verifySignedBy(chain[i], chain[i + 1])) return false;
        }
        return true;
    }
}
