package io.netscope.subdomains.sources;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.TreeSet;

/**
 * CertSpotter (operated by SSLMate) — fallback when crt.sh flakes.
 * Free public API at {@code api.certspotter.com}, same CT data as
 * crt.sh, much more reliable.
 *
 * <p>Response shape: a JSON array of
 * {@code {"dns_names": ["a.example.com", "b.example.com"]}} certificate
 * entries. Pagination via the {@code after} param is supported but we
 * don't use it — the most-recent batch is plenty for recon use cases.
 *
 * <p>No retry: this source is the safety net; if it's down too there's
 * nothing more to try, and the circuit-breaker fallback owns the
 * client-facing error.
 */
public final class CertSpotterSource {

    private static final Logger log = LoggerFactory.getLogger(CertSpotterSource.class);

    private final RestClient rest;
    private final ObjectMapper mapper;
    private final long maxResponseBytes;
    private final int maxSubdomains;

    public CertSpotterSource(RestClient rest, ObjectMapper mapper,
                             long maxResponseBytes, int maxSubdomains) {
        this.rest = rest;
        this.mapper = mapper;
        this.maxResponseBytes = maxResponseBytes;
        this.maxSubdomains = maxSubdomains;
    }

    /** Display name surfaced in the response payload's {@code source} field. */
    public String displayName() {
        return "CertSpotter (Certificate Transparency)";
    }

    /** Fetch + parse, populating {@code subs}. Throws on any failure. */
    public void fetchInto(String domain, TreeSet<String> subs) {
        log.info("[crtsh] HTTP GET https://api.certspotter.com/v1/issuances?domain={}&include_subdomains=true&expand=dns_names",
            domain);
        long httpStart = System.currentTimeMillis();
        byte[] raw;
        try {
            raw = rest.get()
                .uri("https://api.certspotter.com/v1/issuances?domain={d}&include_subdomains=true&expand=dns_names",
                    domain)
                .retrieve().body(byte[].class);
        } catch (Exception e) {
            log.error("[crtsh] CertSpotter HTTP call failed: {} - {}",
                e.getClass().getSimpleName(), e.getMessage());
            throw new RuntimeException("CertSpotter HTTP failed: " + e.getMessage(), e);
        }
        long httpMs = System.currentTimeMillis() - httpStart;
        log.info("[crtsh] CertSpotter HTTP done in {} ms, body={} bytes",
            httpMs, raw == null ? -1 : raw.length);

        if (raw == null || raw.length == 0) {
            throw new RuntimeException("CertSpotter returned empty body");
        }
        if (raw.length > maxResponseBytes) {
            throw new RuntimeException("CertSpotter response too large: " + raw.length + " bytes");
        }
        try {
            JsonNode arr = mapper.readTree(raw);
            if (!arr.isArray()) {
                log.warn("[crtsh] CertSpotter response is NOT an array, got nodeType={} body-prefix='{}'",
                    arr.getNodeType(),
                    new String(raw, StandardCharsets.UTF_8)
                        .substring(0, Math.min(200, raw.length)));
                throw new RuntimeException("CertSpotter response is not a JSON array");
            }
            log.info("[crtsh] CertSpotter parsed {} certificate entries for domain='{}'",
                arr.size(), domain);
            outer:
            for (JsonNode n : arr) {
                JsonNode dnsNames = n.path("dns_names");
                if (!dnsNames.isArray()) continue;
                for (JsonNode nameNode : dnsNames) {
                    String name = nameNode.asText("").trim().toLowerCase();
                    if (name.startsWith("*.")) name = name.substring(2);
                    if (!name.isBlank() && (name.endsWith("." + domain) || name.equals(domain))) {
                        subs.add(name);
                        if (subs.size() >= maxSubdomains) break outer;
                    }
                }
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("CertSpotter JSON parse failed: " + e.getMessage(), e);
        }
    }
}
