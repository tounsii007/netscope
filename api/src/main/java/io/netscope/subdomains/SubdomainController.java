package io.netscope.subdomains;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.netscope.common.ApiException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.*;

/**
 * Enumerates subdomains from Certificate Transparency logs via crt.sh.
 * Cached 1h in Redis to stay polite to the upstream.
 */
@RestController
@RequestMapping("/api/v1/subdomains")
public class SubdomainController {

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
                    var rf = new org.springframework.http.client.SimpleClientHttpRequestFactory();
                    rf.setConnectTimeout(5_000);
                    rf.setReadTimeout(20_000);
                    r = rest = RestClient.builder()
                        .requestFactory(rf)
                        .defaultHeader("User-Agent", "NetScope/1.0")
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
        if (!domain.matches("^[a-zA-Z0-9.-]{1,253}$")) throw ApiException.badRequest("invalid domain");
        String cached = redis.opsForValue().get("subs:" + domain);
        if (cached != null) {
            try { return mapper.readValue(cached, Map.class); } catch (Exception ignored) {}
        }

        long start = System.currentTimeMillis();
        TreeSet<String> subs = new TreeSet<>();
        boolean truncated = false;
        try {
            // Fetch as bytes so we can enforce the body-size cap before parsing.
            byte[] raw = rest().get()
                .uri("https://crt.sh/?q=%25.{d}&output=json", domain)
                .retrieve().body(byte[].class);
            if (raw == null) {
                throw ApiException.badRequest("CT log returned empty response");
            }
            if (raw.length > MAX_RESPONSE_BYTES) {
                throw ApiException.badRequest("CT log response too large (" + raw.length + " bytes)");
            }
            String body = new String(raw, java.nio.charset.StandardCharsets.UTF_8);
            JsonNode arr = mapper.readTree(body);
            if (arr.isArray()) {
                outer:
                for (JsonNode n : arr) {
                    for (String name : n.path("name_value").asText("").split("\n")) {
                        name = name.trim().toLowerCase();
                        if (name.startsWith("*.")) name = name.substring(2);
                        if (!name.isBlank() && (name.endsWith("." + domain) || name.equals(domain))) {
                            subs.add(name);
                            if (subs.size() >= MAX_SUBDOMAINS) {
                                // Stop processing — large enough sample for any realistic use.
                                truncated = true;
                                break outer;
                            }
                        }
                    }
                }
            }
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.badRequest("CT log lookup failed: " + e.getMessage());
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("count", subs.size());
        out.put("subdomains", new ArrayList<>(subs));
        out.put("truncated", truncated);
        out.put("source", "crt.sh (Certificate Transparency)");
        out.put("durationMs", System.currentTimeMillis() - start);

        try { redis.opsForValue().set("subs:" + domain, mapper.writeValueAsString(out), Duration.ofHours(1)); }
        catch (Exception ignored) {}
        return out;
    }

    @SuppressWarnings("unused")
    public Map<String, Object> findFallback(String domain, Throwable t) {
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
