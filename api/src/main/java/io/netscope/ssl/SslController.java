package io.netscope.ssl;

import io.netscope.common.errors.ApiException;
import io.netscope.common.ResponseCache;
import io.netscope.common.security.TargetValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import javax.net.ssl.*;
import java.net.InetSocketAddress;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * SSL / TLS inspector HTTP boundary. Performs one TLS handshake
 * against the target host, collects the presented certificate chain,
 * and emits a JSON view rich enough to explain *why* the cert chain
 * looks the way it does — not just whether it "works".
 *
 * Substantive logic delegated to focused helpers:
 *
 *   • {@link SslPublicKeyDescriber} — algorithm + bits + EC curve
 *   • {@link SslKeyUsageDescriber}  — KU + EKU bit decoding
 *   • {@link SslAiaExtractor}       — AIA → caIssuers + OCSP URLs
 *   • {@link SslChainVerifier}      — adjacent-pair signature verify
 *   • {@link SslWarningCollector}   — expiry + key + sig-alg warnings
 *
 * The controller itself owns: SSRF-resolved address, SNI-preserving
 * connect, response cache, and shaping the per-position chain map.
 */
@RestController
@RequestMapping("/api/v1/ssl")
public class SslController {

    private static final Logger log = LoggerFactory.getLogger(SslController.class);

    private final TargetValidator validator;
    private final ResponseCache cache;

    public SslController(TargetValidator v, ResponseCache cache) {
        this.validator = v;
        this.cache = cache;
    }

    @GetMapping("/{host}")
    @SuppressWarnings("unchecked")
    public Map<String, Object> inspect(
            @PathVariable String host,
            @RequestParam(defaultValue = "443") int port) {
        // SSRF + DNS-rebinding defense: resolve once via the validator,
        // then connect by the validated InetAddress. Without this,
        // new InetSocketAddress(host, port) would do a SECOND DNS
        // lookup at connect time — and a low-TTL attacker resolver
        // could return a public IP first (passes validate) and
        // 127.0.0.1 second (the socket would then target the loopback
        // service and leak the TLS chain back to the user).
        java.net.InetAddress addr = validator.resolveAndValidate(host);
        return cache.get("ssl", host + ":" + port, Map.class,
                Duration.ofMinutes(15), () -> {
            try { return doInspect(host, addr, port); }
            catch (Exception e) {
                throw ApiException.sanitizedFailure(log, "SSL handshake failed", e);
            }
        });
    }

    private Map<String, Object> doInspect(String host, java.net.InetAddress addr, int port) throws Exception {
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, null, null);
        SSLSocketFactory factory = ctx.getSocketFactory();

        try (SSLSocket socket = (SSLSocket) factory.createSocket()) {
            socket.connect(new InetSocketAddress(addr, port), 5000);
            socket.setSoTimeout(5000);
            // Keep the original hostname as the SNI value so the server
            // returns the correct virtual-host certificate even when we
            // dialled the validated InetAddress.
            SSLParameters params = socket.getSSLParameters();
            params.setServerNames(List.of(new SNIHostName(host)));
            socket.setSSLParameters(params);
            socket.startHandshake();

            SSLSession session = socket.getSession();
            X509Certificate[] chain = (X509Certificate[]) session.getPeerCertificates();
            X509Certificate leaf = chain[0];

            List<Map<String, Object>> chainOut = new ArrayList<>();
            for (int i = 0; i < chain.length; i++) {
                chainOut.add(describeChainPosition(chain, i));
            }

            long daysLeft = ChronoUnit.DAYS.between(Instant.now(), leaf.getNotAfter().toInstant());
            Map<String, Object> leafKey = SslPublicKeyDescriber.describe(leaf.getPublicKey());

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("host", host);
            out.put("port", port);
            out.put("tlsVersion", session.getProtocol());
            out.put("cipherSuite", session.getCipherSuite());
            out.put("subject", leaf.getSubjectX500Principal().getName());
            out.put("issuer",  leaf.getIssuerX500Principal().getName());
            out.put("validFrom", leaf.getNotBefore().toInstant().toString());
            out.put("validTo",   leaf.getNotAfter().toInstant().toString());
            out.put("daysUntilExpiry", daysLeft);
            out.put("expired", daysLeft < 0);
            out.put("publicKeyAlgorithm", leafKey.get("algorithm"));
            out.put("publicKeyBits", leafKey.get("bits"));
            if (leafKey.containsKey("curve")) out.put("publicKeyCurve", leafKey.get("curve"));
            out.put("sans", extractSans(leaf));
            out.put("keyUsage", SslKeyUsageDescriber.describeKeyUsage(leaf.getKeyUsage()));
            out.put("extendedKeyUsage", SslKeyUsageDescriber.safeExtKeyUsage(leaf));
            Map<String, List<String>> leafAia = SslAiaExtractor.extractFromCert(leaf);
            out.put("caIssuersUrls",     leafAia.getOrDefault("caIssuers", List.of()));
            out.put("ocspResponderUrls", leafAia.getOrDefault("ocsp",      List.of()));
            // SCT presence proves the CA logged this cert into a CT log
            // (RFC 6962). Absence is now flag-worthy — every browser
            // requires CT for new certs issued after 2018-04-30.
            out.put("hasSctExtension", leaf.getExtensionValue("1.3.6.1.4.1.11129.2.4.2") != null);
            out.put("chainComplete", SslChainVerifier.chainSignedThrough(chain));
            out.put("chain", chainOut);
            out.put("selfSigned", leaf.getSubjectX500Principal().equals(leaf.getIssuerX500Principal()));
            List<String> warnings = SslWarningCollector.collect(leaf, daysLeft, leafKey);
            if (!warnings.isEmpty()) out.put("warnings", warnings);
            return out;
        }
    }

    /** Per-position chain row. Position 0 is the leaf. */
    private static Map<String, Object> describeChainPosition(X509Certificate[] chain, int i) {
        X509Certificate c = chain[i];
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("position", i);
        entry.put("subject",   c.getSubjectX500Principal().getName());
        entry.put("issuer",    c.getIssuerX500Principal().getName());
        entry.put("validFrom", c.getNotBefore().toInstant().toString());
        entry.put("validTo",   c.getNotAfter().toInstant().toString());
        entry.put("serial",    c.getSerialNumber().toString(16));
        entry.put("sigAlg",    c.getSigAlgName());
        entry.put("selfSigned", c.getSubjectX500Principal().equals(c.getIssuerX500Principal()));
        Map<String, Object> keyInfo = SslPublicKeyDescriber.describe(c.getPublicKey());
        entry.put("publicKeyAlgorithm", keyInfo.get("algorithm"));
        entry.put("publicKeyBits",      keyInfo.get("bits"));
        if (keyInfo.containsKey("curve")) entry.put("publicKeyCurve", keyInfo.get("curve"));
        entry.put("keyUsage",         SslKeyUsageDescriber.describeKeyUsage(c.getKeyUsage()));
        entry.put("extendedKeyUsage", SslKeyUsageDescriber.safeExtKeyUsage(c));
        Map<String, List<String>> aia = SslAiaExtractor.extractFromCert(c);
        entry.put("caIssuersUrls",     aia.getOrDefault("caIssuers", List.of()));
        entry.put("ocspResponderUrls", aia.getOrDefault("ocsp",      List.of()));
        entry.put("signedByNext",
            (i + 1 < chain.length) ? SslChainVerifier.verifySignedBy(c, chain[i + 1]) : null);
        return entry;
    }

    private static List<String> extractSans(X509Certificate cert) {
        try {
            Collection<List<?>> sans = cert.getSubjectAlternativeNames();
            if (sans == null) return List.of();
            List<String> out = new ArrayList<>();
            for (List<?> s : sans) if (s.size() >= 2) out.add(String.valueOf(s.get(1)));
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    /* ─── Legacy delegating static methods kept for SslControllerHelpersTest ─── */
    // The test references SslController.describeKeyUsage(...) and
    // SslController.extractAiaFromOctets(...) directly. Delegating keeps
    // it green without an import churn here.

    static List<String> describeKeyUsage(boolean[] bits) {
        return SslKeyUsageDescriber.describeKeyUsage(bits);
    }

    static Map<String, List<String>> extractAiaFromOctets(byte[] octets) {
        return SslAiaExtractor.extractFromOctets(octets);
    }
}
