package io.netscope.ip;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.errors.ApiException;
import io.netscope.ip.sources.IpSourceFetcher;
import io.netscope.ip.sources.IpSourceRegistry;
import io.netscope.ip.sources.IpSourceResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Queries several free public geolocation APIs in parallel for the
 * same IP and aggregates their answers. The frontend renders one card
 * per source so the user can compare results — accuracy varies wildly
 * between providers (especially for residential IPs and CGNAT) and
 * seeing the divergence is the whole point.
 *
 * Thin orchestrator. The per-source HTTP + JSON-parsing logic lives
 * under {@link io.netscope.ip.sources}; adding a new source is a
 * single file there plus one line in
 * {@link IpSourceRegistry#build}.
 *
 * Per-source timeout: 3 s (so the slowest source can't stall the
 * aggregate). Redis cache TTL: 12 h per IP.
 */
@Service
public class IpMultiSourceService {

    private static final Logger log = LoggerFactory.getLogger(IpMultiSourceService.class);

    private static final Duration SOURCE_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration CACHE_TTL = Duration.ofHours(12);

    private final ObjectMapper mapper = new ObjectMapper();
    private final StringRedisTemplate redis;
    private final RestClient rest;
    private final ExecutorService executor;

    @Value("${netscope.geoip.ipinfo-token:}") private String ipinfoToken;
    @Value("${netscope.geoip.ipgeolocation-key:}") private String ipGeolocationKey;

    public IpMultiSourceService(StringRedisTemplate redis) {
        this.redis = redis;
        // JDK HttpClient with redirect-follow + HTTP/1.1 — some geo-API
        // CDNs (Cloudflare in front of ipapi.co) reject Java's default
        // HTTP/2 negotiation otherwise.
        HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .version(HttpClient.Version.HTTP_1_1)
            .build();
        var rf = new JdkClientHttpRequestFactory(httpClient);
        rf.setReadTimeout(SOURCE_TIMEOUT);
        this.rest = RestClient.builder()
            .requestFactory(rf)
            .defaultHeader("User-Agent", "NetScope/1.0 (geolocation-aggregator)")
            .defaultHeader("Accept", "application/json, */*")
            .build();

        // Virtual-thread per task: every geo-API call is I/O-bound and
        // spends ~99% of its lifetime blocked on a TCP read. Pooling
        // platform threads (the previous fixedThreadPool(8)) wasted
        // ~7 OS threads per active probe AND artificially throttled
        // concurrent users to 8 in-flight aggregates — under a small
        // burst the pool's task queue would balloon and add HEAD-of-
        // line latency to subsequent lookups. Virtual threads remove
        // both problems with no behavioural change.
        this.executor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("ip-multi-source-", 0).factory());
    }

    public Map<String, Object> lookup(String ip) {
        if (!isValidIp(ip)) throw ApiException.badRequest("invalid IP");
        // F-02: enforce the same reserved/loopback/RFC1918/CGNAT/cloud-metadata
        // block that /lookup applies via IpService.lookup(). Without this, a
        // direct call to /api/v1/ip/{ip}/sources can fan-out queries for
        // 169.254.169.254, 127.0.0.1, 10.x, etc. to every upstream geo provider
        // — bypassing the policy IpAddressGuard exists to enforce. Symmetric
        // with IpService.lookup(); both endpoints MUST agree on what is
        // queryable, otherwise the multi-source path becomes a trivial bypass.
        IpAddressGuard.parseAndGuard(ip);

        String cacheKey = "ip-multi:" + ip;
        Map<String, Object> cachedHit = readCache(cacheKey);
        if (cachedHit != null) return cachedHit;

        long start = System.currentTimeMillis();
        List<IpSourceFetcher> all = IpSourceRegistry.build(rest, mapper, ipinfoToken, ipGeolocationKey);

        List<CompletableFuture<IpSourceResult>> futures = all.stream()
            .map(f -> CompletableFuture.supplyAsync(() -> runOne(f, ip), executor))
            .toList();
        List<IpSourceResult> results = futures.stream().map(CompletableFuture::join).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ip", ip);
        out.put("durationMs", System.currentTimeMillis() - start);
        out.put("sources", results);
        out.put("sourceCount", results.size());
        out.put("successCount", results.stream().filter(IpSourceResult::ok).count());

        writeCache(cacheKey, out);
        return out;
    }

    /** Cache reader. Returns null on miss/parse-error so the caller goes to live sources. */
    private Map<String, Object> readCache(String cacheKey) {
        try {
            String cached = redis.opsForValue().get(cacheKey);
            if (cached == null) return null;
            @SuppressWarnings("unchecked")
            Map<String, Object> deser = mapper.readValue(cached, Map.class);
            deser.put("cached", true);
            return deser;
        } catch (Exception e) {
            log.warn("[ip-multi] cache read failed: {}", e.getMessage());
            return null;
        }
    }

    /** Best-effort cache write — never propagates Redis errors. */
    private void writeCache(String cacheKey, Map<String, Object> out) {
        try {
            redis.opsForValue().set(cacheKey, mapper.writeValueAsString(out), CACHE_TTL);
        } catch (Exception ignored) {
        }
    }

    /** Run one source with logging + per-source timing. Never throws. */
    private IpSourceResult runOne(IpSourceFetcher f, String ip) {
        long t0 = System.currentTimeMillis();
        try {
            Map<String, Object> data = f.fetch(ip);
            return IpSourceResult.ok(f.name(), f.url(ip), data, System.currentTimeMillis() - t0);
        } catch (Exception e) {
            log.warn("[ip-multi] source '{}' failed: {} - {}",
                f.name(), e.getClass().getSimpleName(), e.getMessage());
            // Surface only the exception class name to the API
            // consumer. Detail messages frequently embed the geo-
            // provider's upstream IP, the API-key fragment from the
            // URL, or Cloudflare's ray ID — none of which the user
            // needs to see. Operators get the full reason via the
            // warn log line above.
            return IpSourceResult.fail(f.name(), f.url(ip),
                e.getClass().getSimpleName(), System.currentTimeMillis() - t0);
        }
    }

    private static boolean isValidIp(String ip) {
        if (ip == null || ip.isBlank()) return false;
        // Lightweight check — full validation lives in IpService.
        return ip.matches("^[0-9a-fA-F:.]{2,45}$");
    }
}
