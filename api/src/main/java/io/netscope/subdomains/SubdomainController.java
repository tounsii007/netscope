package io.netscope.subdomains;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.netscope.common.errors.ApiException;
import io.netscope.common.security.DomainNormaliser;
import io.netscope.subdomains.sources.CertSpotterSource;
import io.netscope.subdomains.sources.CrtShSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeSet;

/**
 * Enumerates subdomains from Certificate Transparency logs.
 *
 * <p>Tries crt.sh first (the canonical source) then falls back to
 * CertSpotter when crt.sh's nginx flakes — each source lives in its own
 * file under the {@code sources/} subpackage. Results are cached for an
 * hour in Redis to stay polite to upstream.
 */
@RestController
@RequestMapping("/api/v1/subdomains")
public class SubdomainController {

    private static final Logger log = LoggerFactory.getLogger(SubdomainController.class);

    /** Redis cache TTL for the per-domain subdomain result. 1 h keeps the
     *  load on crt.sh / CertSpotter low while still surfacing recently-
     *  added subdomains within the hour. */
    private static final Duration CACHE_TTL = Duration.ofHours(1);

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

    private final SubdomainHttpClient http = new SubdomainHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();
    private final StringRedisTemplate redis;

    public SubdomainController(StringRedisTemplate redis) { this.redis = redis; }

    @GetMapping("/{domain}")
    @CircuitBreaker(name = "crtsh", fallbackMethod = "findFallback")
    public Map<String, Object> find(@PathVariable String domain) {
        log.info("[crtsh] >>> find() entry domain='{}'", domain);

        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^(?!.*\\.\\.)[a-zA-Z0-9.-]{1,253}$")) {
            log.warn("[crtsh] invalid domain rejected: '{}'", domain);
            throw ApiException.badRequest("invalid domain");
        }

        Map<String, Object> cached = readCache(domain);
        if (cached != null) return cached;

        long start = System.currentTimeMillis();
        TreeSet<String> subs = new TreeSet<>();
        String source = runSourcesInto(domain, subs);
        boolean truncated = subs.size() >= MAX_SUBDOMAINS;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("count", subs.size());
        out.put("subdomains", new ArrayList<>(subs));
        out.put("truncated", truncated);
        out.put("source", source);
        out.put("durationMs", System.currentTimeMillis() - start);

        writeCache(domain, out);
        log.info("[crtsh] <<< find() success domain='{}' count={} truncated={} totalMs={}",
            domain, subs.size(), truncated, System.currentTimeMillis() - start);
        return out;
    }

    /**
     * Try crt.sh first, fall back to CertSpotter on any failure. If
     * both fail we re-throw wrapping the original crt.sh error so the
     * circuit breaker counts it against the canonical source.
     */
    private String runSourcesInto(String domain, TreeSet<String> subs) {
        CrtShSource crtsh = new CrtShSource(http.get(), mapper, MAX_RESPONSE_BYTES, MAX_SUBDOMAINS);
        try {
            crtsh.fetchInto(domain, subs);
            return crtsh.displayName();
        } catch (Exception primaryFail) {
            log.warn("[crtsh] primary source crt.sh failed ({} - {}), falling back to CertSpotter",
                primaryFail.getClass().getSimpleName(), primaryFail.getMessage());
            CertSpotterSource certspotter = new CertSpotterSource(
                http.get(), mapper, MAX_RESPONSE_BYTES, MAX_SUBDOMAINS);
            try {
                certspotter.fetchInto(domain, subs);
                log.info("[crtsh] CertSpotter fallback succeeded with {} subdomains for domain='{}'",
                    subs.size(), domain);
                return certspotter.displayName();
            } catch (Exception secondaryFail) {
                log.error("[crtsh] both sources FAILED for domain='{}'. crt.sh: {} | certspotter: {} - {}",
                    domain, primaryFail.getMessage(),
                    secondaryFail.getClass().getSimpleName(), secondaryFail.getMessage(), secondaryFail);
                throw new RuntimeException("Both crt.sh and CertSpotter failed", primaryFail);
            }
        }
    }

    private Map<String, Object> readCache(String domain) {
        String cached;
        try {
            cached = redis.opsForValue().get("subs:" + domain);
        } catch (Exception e) {
            log.warn("[crtsh] redis GET failed (continuing without cache): {} - {}",
                e.getClass().getSimpleName(), e.getMessage());
            return null;
        }
        if (cached == null) {
            log.info("[crtsh] cache MISS for domain='{}'", domain);
            return null;
        }
        log.info("[crtsh] cache HIT for domain='{}' ({} bytes)", domain, cached.length());
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> deser = mapper.readValue(cached, Map.class);
            return deser;
        } catch (Exception e) {
            log.warn("[crtsh] cache deserialization failed (will refetch): {} - {}",
                e.getClass().getSimpleName(), e.getMessage());
            return null;
        }
    }

    private void writeCache(String domain, Map<String, Object> out) {
        try {
            redis.opsForValue().set("subs:" + domain, mapper.writeValueAsString(out), CACHE_TTL);
            log.info("[crtsh] cached result for domain='{}'", domain);
        } catch (Exception e) {
            log.warn("[crtsh] redis SET failed (returning anyway): {} - {}",
                e.getClass().getSimpleName(), e.getMessage());
        }
    }

    @SuppressWarnings("unused")
    public Map<String, Object> findFallback(String domain, Throwable t) {
        return SubdomainFallbackResponse.build(domain, t);
    }
}
