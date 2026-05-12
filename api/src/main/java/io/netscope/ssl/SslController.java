package io.netscope.ssl;

import io.netscope.common.ApiException;
import io.netscope.common.ResponseCache;
import io.netscope.common.TargetValidator;
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
                throw ApiException.badRequest("SSL error: " + e.getMessage());
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
            for (X509Certificate c : chain) {
                Map<String, Object> entry = new LinkedHashMap<>();
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
}
