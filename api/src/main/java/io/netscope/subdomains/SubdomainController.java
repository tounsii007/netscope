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

    private final RestClient rest = RestClient.builder()
        .defaultHeader("User-Agent", "NetScope/1.0").build();
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
        try {
            String body = rest.get()
                .uri("https://crt.sh/?q=%25.{d}&output=json", domain)
                .retrieve().body(String.class);
            JsonNode arr = mapper.readTree(body);
            if (arr.isArray()) {
                for (JsonNode n : arr) {
                    for (String name : n.path("name_value").asText("").split("\n")) {
                        name = name.trim().toLowerCase();
                        if (name.startsWith("*.")) name = name.substring(2);
                        if (!name.isBlank() && (name.endsWith("." + domain) || name.equals(domain))) {
                            subs.add(name);
                        }
                    }
                }
            }
        } catch (Exception e) {
            throw ApiException.badRequest("CT log lookup failed: " + e.getMessage());
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("count", subs.size());
        out.put("subdomains", new ArrayList<>(subs));
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
        return out;
    }
}
