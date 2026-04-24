package io.netscope.ssl;

import io.netscope.common.ApiException;
import io.netscope.common.ResponseCache;
import io.netscope.common.TargetValidator;
import org.springframework.web.bind.annotation.*;

import javax.net.ssl.*;
import java.net.InetSocketAddress;
import java.security.cert.X509Certificate;
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
        validator.resolveAndValidate(host);
        return cache.get("ssl", host + ":" + port, Map.class, Duration.ofMinutes(15), () -> {
            try {
                return doInspect(host, port);
            } catch (Exception e) {
                throw ApiException.badRequest("SSL error: " + e.getMessage());
            }
        });
    }

    private Map<String, Object> doInspect(String host, int port) throws Exception {
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, null, null);
        SSLSocketFactory factory = ctx.getSocketFactory();

        try (SSLSocket socket = (SSLSocket) factory.createSocket()) {
            socket.connect(new InetSocketAddress(host, port), 5000);
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
                chainOut.add(Map.of(
                    "subject", c.getSubjectX500Principal().getName(),
                    "issuer", c.getIssuerX500Principal().getName(),
                    "validFrom", c.getNotBefore().toInstant().toString(),
                    "validTo", c.getNotAfter().toInstant().toString(),
                    "serial", c.getSerialNumber().toString(16),
                    "sigAlg", c.getSigAlgName()
                ));
            }

            long daysLeft = ChronoUnit.DAYS.between(Instant.now(), leaf.getNotAfter().toInstant());

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
            out.put("sans", extractSans(leaf));
            out.put("chain", chainOut);
            return out;
        }
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
