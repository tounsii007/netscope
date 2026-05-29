package io.netscope.subdomains;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.netscope.common.ApiException;
import io.netscope.common.security.DomainNormaliser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;

/**
 * Enumerates subdomains from Certificate Transparency logs via crt.sh.
 * Cached 1h in Redis to stay polite to the upstream.
 */
@RestController
@RequestMapping("/api/v1/subdomains")
public class SubdomainController {

    private static final Logger log = LoggerFactory.getLogger(SubdomainController.class);

    /**
     * Hard cap on the number of subdomains we keep in memory / return to the
     * client. Popular targets like example.com / google.com / facebook.com
     * have 100 000+ certs in CT logs which would otherwise:
     *   • Pin 50+ MB of heap per request
     *   • Produce a 50+ MB JSON response (network amp + browser freeze)
     *   • Inflate Redis cache entries past their max value size
     *
     * 10 000 is more than enough for any realistic recon use case; the
     * response includes {@code truncated: true} so the caller knows.
     */
    static final int MAX_SUBDOMAINS = 10_000;

    /** Hard cap on the upstream response body size (16 MB). */
    static final long MAX_RESPONSE_BYTES = 16L * 1024 * 1024;

    // Lazy-init: building a RestClient at field-init time triggers HTTP-stack
    // setup that fails in restricted environments (and is wasted work for
    // instances that never see traffic). Cached after first call.
    private volatile RestClient rest;
    private RestClient rest() {
        RestClient r = rest;
        if (r == null) {
            synchronized (this) {
                if ((r = rest) == null) {
                    HttpClient http = HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(5))
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .version(HttpClient.Version.HTTP_1_1)
                        .build();
                    var rf = new JdkClientHttpRequestFactory(http);
                    rf.setReadTimeout(Duration.ofSeconds(20));
                    r = rest = RestClient.builder()
                        .requestFactory(rf)
                        // crt.sh nginx is finicky about UA fingerprinting; mimic curl
                        // which we know works from the same machine.
                        .defaultHeader("User-Agent", "curl/8.18.0")
                        .defaultHeader("Accept", "application/json, */*")
                        .build();
                }
            }
        }
        return r;
    }
    private final ObjectMapper mapper = new ObjectMapper();
    private final StringRedisTemplate redis;

    public SubdomainController(StringRedisTemplate redis) { this.redis = redis; }

    @GetMapping("/{domain}")
    @CircuitBreaker(name = "crtsh", fallbackMethod = "findFallback")
    public Map<String, Object> find(@PathVariable String domain) {
        log.info("[crtsh] >>> find() entry domain='{}'", domain);

        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            log.warn("[crtsh] invalid domain rejected: '{}'", domain);
            throw ApiException.badRequest("invalid domain");
        }

        // --- Redis cache check ---
        String cached;
        try {
            cached = redis.opsForValue().get("subs:" + domain);
        } catch (Exception e) {
            log.warn("[crtsh] redis GET failed (continuing without cache): {} - {}",
                e.getClass().getSimpleName(), e.getMessage());
            cached = null;
        }
        if (cached != null) {
            log.info("[crtsh] cache HIT for domain='{}' ({} bytes)", domain, cached.length());
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> deser = mapper.readValue(cached, Map.class);
                return deser;
            } catch (Exception e) {
                log.warn("[crtsh] cache deserialization failed (will refetch): {} - {}",
                    e.getClass().getSimpleName(), e.getMessage());
            }
        } else {
            log.info("[crtsh] cache MISS for domain='{}'", domain);
        }

        long start = System.currentTimeMillis();
        TreeSet<String> subs = new TreeSet<>();
        boolean truncated = false;
        byte[] raw;

        // --- Try crt.sh first, then CertSpotter as fallback ---
        // crt.sh is the canonical source but their nginx flakes / rate-limits
        // aggressively (502/503/504). CertSpotter (operated by SSLMate) has
        // the same CT data, free public API, and is much more reliable.
        String source;
        try {
            raw = fetchWithRetry(domain);
            source = "crt.sh (Certificate Transparency)";
            parseCrtShBody(raw, domain, subs);
            truncated = subs.size() >= MAX_SUBDOMAINS;
        } catch (Exception primaryFail) {
            log.warn("[crtsh] primary source crt.sh failed ({} - {}), falling back to CertSpotter",
                primaryFail.getClass().getSimpleName(), primaryFail.getMessage());
            try {
                fetchAndParseCertSpotter(domain, subs);
                source = "CertSpotter (Certificate Transparency)";
                truncated = subs.size() >= MAX_SUBDOMAINS;
                log.info("[crtsh] CertSpotter fallback succeeded with {} subdomains for domain='{}'",
                    subs.size(), domain);
            } catch (Exception secondaryFail) {
                log.error("[crtsh] both sources FAILED for domain='{}'. crt.sh: {} | certspotter: {} - {}",
                    domain, primaryFail.getMessage(),
                    secondaryFail.getClass().getSimpleName(), secondaryFail.getMessage(), secondaryFail);
                // Re-throw the original crt.sh error so the circuit breaker counts it.
                throw new RuntimeException("Both crt.sh and CertSpotter failed", primaryFail);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("count", subs.size());
        out.put("subdomains", new ArrayList<>(subs));
        out.put("truncated", truncated);
        out.put("source", source);
        out.put("durationMs", System.currentTimeMillis() - start);

        try {
            redis.opsForValue().set("subs:" + domain, mapper.writeValueAsString(out), Duration.ofHours(1));
            log.info("[crtsh] cached result for domain='{}'", domain);
        } catch (Exception e) {
            log.warn("[crtsh] redis SET failed (returning anyway): {} - {}",
                e.getClass().getSimpleName(), e.getMessage());
        }

        log.info("[crtsh] <<< find() success domain='{}' count={} truncated={} totalMs={}",
            domain, subs.size(), truncated, System.currentTimeMillis() - start);
        return out;
    }

    /**
     * Parse crt.sh JSON response into the subdomains TreeSet.
     * crt.sh returns an array of {@code {"name_value": "a.example.com\nb.example.com"}}.
     */
    private void parseCrtShBody(byte[] raw, String domain, TreeSet<String> subs) {
        if (raw == null || raw.length == 0) {
            throw new RuntimeException("crt.sh returned empty body");
        }
        if (raw.length > MAX_RESPONSE_BYTES) {
            throw new RuntimeException("crt.sh response too large: " + raw.length + " bytes");
        }
        try {
            String body = new String(raw, java.nio.charset.StandardCharsets.UTF_8);
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
                        if (subs.size() >= MAX_SUBDOMAINS) break outer;
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

    /**
     * CertSpotter fallback (SSLMate). Free public API; same CT data, much
     * more reliable than crt.sh. Response: array of
     * {@code {"dns_names": ["a.example.com", "b.example.com"]}}.
     * <p>Pagination via the {@code after} param is supported but we don't
     * use it — the most-recent batch is plenty for recon use cases.
     */
    private void fetchAndParseCertSpotter(String domain, TreeSet<String> subs) {
        log.info("[crtsh] HTTP GET https://api.certspotter.com/v1/issuances?domain={}&include_subdomains=true&expand=dns_names",
            domain);
        long httpStart = System.currentTimeMillis();
        byte[] raw;
        try {
            raw = rest().get()
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
        if (raw.length > MAX_RESPONSE_BYTES) {
            throw new RuntimeException("CertSpotter response too large: " + raw.length + " bytes");
        }
        try {
            JsonNode arr = mapper.readTree(raw);
            if (!arr.isArray()) {
                log.warn("[crtsh] CertSpotter response is NOT an array, got nodeType={} body-prefix='{}'",
                    arr.getNodeType(),
                    new String(raw, java.nio.charset.StandardCharsets.UTF_8)
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
                        if (subs.size() >= MAX_SUBDOMAINS) break outer;
                    }
                }
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("CertSpotter JSON parse failed: " + e.getMessage(), e);
        }
    }

    /**
     * Retry-aware fetch: up to 3 attempts with 1s / 2s / 4s backoff. Retries
     * on 502/503/504 and IO/timeout errors. Other 4xx (e.g. 400 invalid query)
     * fail fast.
     */
    private byte[] fetchWithRetry(String domain) {
        int attempts = 2; // 2 attempts only — fall back to CertSpotter quickly
        long backoffMs = 1500;
        Exception last = null;
        for (int i = 1; i <= attempts; i++) {
            try {
                log.info("[crtsh] HTTP GET attempt {}/{} https://crt.sh/?q=%25.{}&output=json",
                    i, attempts, domain);
                long httpStart = System.currentTimeMillis();
                byte[] raw = rest().get()
                    .uri("https://crt.sh/?q=%25.{d}&output=json", domain)
                    .retrieve().body(byte[].class);
                long httpMs = System.currentTimeMillis() - httpStart;
                log.info("[crtsh] HTTP attempt {} OK in {} ms, body={} bytes",
                    i, httpMs, raw == null ? -1 : raw.length);
                return raw;
            } catch (org.springframework.web.client.HttpServerErrorException e) {
                // 5xx — retryable
                last = e;
                log.warn("[crtsh] HTTP attempt {}/{} got 5xx {} for domain='{}', retrying in {} ms",
                    i, attempts, e.getStatusCode(), domain, backoffMs);
            } catch (org.springframework.web.client.ResourceAccessException e) {
                // network / IO / timeout — retryable
                last = e;
                log.warn("[crtsh] HTTP attempt {}/{} IO failure for domain='{}': cause={} - {}, retrying in {} ms",
                    i, attempts, domain,
                    e.getMostSpecificCause().getClass().getSimpleName(),
                    e.getMostSpecificCause().getMessage(), backoffMs);
            } catch (org.springframework.web.client.HttpClientErrorException e) {
                // 4xx — not retryable
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
            // Backoff before next attempt (skip after last attempt)
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

    @SuppressWarnings("unused")
    public Map<String, Object> findFallback(String domain, Throwable t) {
        // Walk the cause chain and log every layer — Spring/Resilience4j wrap
        // the real exception multiple times so the surface message is useless.
        log.error("[crtsh] !!! FALLBACK triggered for domain='{}'", domain);
        Throwable cur = t;
        int depth = 0;
        while (cur != null && depth < 8) {
            log.error("[crtsh] fallback cause [depth={}]: {} - {}",
                depth, cur.getClass().getName(), cur.getMessage());
            cur = cur.getCause();
            depth++;
        }
        // Full stacktrace once, at the end.
        log.error("[crtsh] fallback full stacktrace:", t);

        // Distinguish circuit-breaker-OPEN (no upstream call) from real errors.
        if (t instanceof io.github.resilience4j.circuitbreaker.CallNotPermittedException) {
            log.warn("[crtsh] circuit breaker is OPEN — request was NOT sent to crt.sh. " +
                "Wait for the breaker to half-open (default 60s) or restart the backend.");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("degraded", true);
        out.put("message", "CT log provider unavailable, try again in a minute");
        out.put("subdomains", List.of());
        out.put("count", 0);
        out.put("truncated", false);
        return out;
    }
}
