package io.netscope.subdomains.sources;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.TreeSet;

/**
 * The canonical Certificate Transparency aggregator at
 * <a href="https://crt.sh">crt.sh</a>. Returns a JSON array of
 * {@code {"name_value": "a.example.com\nb.example.com"}} entries.
 *
 * <p>crt.sh's nginx flakes and rate-limits aggressively (502/503/504),
 * so this source uses retry-with-backoff on 5xx and IO failures but
 * fails fast on 4xx — the caller can then escalate to a different
 * source. Two attempts max so the fallback path stays snappy.
 *
 * <p>Both the body-size cap and the result cap are enforced here so
 * one runaway domain can't blow up the heap.
 */
public final class CrtShSource {

    private static final Logger log = LoggerFactory.getLogger(CrtShSource.class);

    private final RestClient rest;
    private final ObjectMapper mapper;
    private final long maxResponseBytes;
    private final int maxSubdomains;

    public CrtShSource(RestClient rest, ObjectMapper mapper,
                       long maxResponseBytes, int maxSubdomains) {
        this.rest = rest;
        this.mapper = mapper;
        this.maxResponseBytes = maxResponseBytes;
        this.maxSubdomains = maxSubdomains;
    }

    /** Display name surfaced in the response payload's {@code source} field. */
    public String displayName() {
        return "crt.sh (Certificate Transparency)";
    }

    /**
     * Fetch and parse, populating {@code subs}. Throws on any failure —
     * the caller decides whether to fall back to a different source.
     */
    public void fetchInto(String domain, TreeSet<String> subs) {
        byte[] raw = fetchWithRetry(domain);
        parseBody(raw, domain, subs);
    }

    /**
     * Retry-aware fetch: 2 attempts with 1.5s / 3s backoff. Retries
     * on 5xx and IO/timeout errors. 4xx (e.g. 400 invalid query) fail
     * fast — those won't fix themselves.
     */
    private byte[] fetchWithRetry(String domain) {
        int attempts = 2;
        long backoffMs = 1500;
        Exception last = null;
        for (int i = 1; i <= attempts; i++) {
            try {
                log.info("[crtsh] HTTP GET attempt {}/{} https://crt.sh/?q=%25.{}&output=json",
                    i, attempts, domain);
                long httpStart = System.currentTimeMillis();
                byte[] raw = rest.get()
                    .uri("https://crt.sh/?q=%25.{d}&output=json", domain)
                    .retrieve().body(byte[].class);
                long httpMs = System.currentTimeMillis() - httpStart;
                log.info("[crtsh] HTTP attempt {} OK in {} ms, body={} bytes",
                    i, httpMs, raw == null ? -1 : raw.length);
                return raw;
            } catch (HttpServerErrorException e) {
                last = e;
                log.warn("[crtsh] HTTP attempt {}/{} got 5xx {} for domain='{}', retrying in {} ms",
                    i, attempts, e.getStatusCode(), domain, backoffMs);
            } catch (ResourceAccessException e) {
                last = e;
                log.warn("[crtsh] HTTP attempt {}/{} IO failure for domain='{}': cause={} - {}, retrying in {} ms",
                    i, attempts, domain,
                    e.getMostSpecificCause().getClass().getSimpleName(),
                    e.getMostSpecificCause().getMessage(), backoffMs);
            } catch (HttpClientErrorException e) {
                log.error("[crtsh] HTTP attempt {} got 4xx {} for domain='{}' (NOT retrying): body-prefix='{}'",
                    i, e.getStatusCode(), domain,
                    e.getResponseBodyAsString().substring(0,
                        Math.min(200, e.getResponseBodyAsString().length())));
                throw e;
            } catch (Exception e) {
                last = e;
                log.warn("[crtsh] HTTP attempt {}/{} unexpected {} for domain='{}': {}, retrying in {} ms",
                    i, attempts, e.getClass().getSimpleName(), domain, e.getMessage(), backoffMs);
            }
            if (i < attempts) {
                try { Thread.sleep(backoffMs); } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("interrupted while retrying crt.sh", ie);
                }
                backoffMs *= 2;
            }
        }
        log.error("[crtsh] all {} attempts FAILED for domain='{}'; last error={} - {}",
            attempts, domain, last == null ? "?" : last.getClass().getName(),
            last == null ? "?" : last.getMessage());
        throw new RuntimeException("crt.sh unreachable after " + attempts + " attempts: "
            + (last == null ? "unknown" : last.getMessage()), last);
    }

    private void parseBody(byte[] raw, String domain, TreeSet<String> subs) {
        if (raw == null || raw.length == 0) {
            throw new RuntimeException("crt.sh returned empty body");
        }
        if (raw.length > maxResponseBytes) {
            throw new RuntimeException("crt.sh response too large: " + raw.length + " bytes");
        }
        try {
            String body = new String(raw, StandardCharsets.UTF_8);
            JsonNode arr = mapper.readTree(body);
            if (!arr.isArray()) {
                log.warn("[crtsh] response is NOT a JSON array, got nodeType={}", arr.getNodeType());
                throw new RuntimeException("crt.sh response is not a JSON array");
            }
            log.info("[crtsh] parsed JSON array with {} entries for domain='{}'", arr.size(), domain);
            outer:
            for (JsonNode n : arr) {
                for (String name : n.path("name_value").asText("").split("\n")) {
                    name = name.trim().toLowerCase();
                    if (name.startsWith("*.")) name = name.substring(2);
                    if (!name.isBlank() && (name.endsWith("." + domain) || name.equals(domain))) {
                        subs.add(name);
                        if (subs.size() >= maxSubdomains) break outer;
                    }
                }
            }
            log.info("[crtsh] extracted {} unique subdomains from crt.sh for domain='{}'",
                subs.size(), domain);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("crt.sh JSON parse failed: " + e.getMessage(), e);
        }
    }
}
