package io.netscope.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.function.Supplier;

/**
 * Simple Redis-backed response cache with JSON serialization.
 *
 * Use for idempotent GET operations whose results are expensive (RDAP
 * lookups, DNS propagation polls, CT-log scans) and tolerable to
 * stale for a few minutes. Falls back to live fetch if Redis
 * misbehaves — the goal is "make the happy path faster", never
 * "fail the request because the cache is down".
 *
 * Hardening
 * ─────────
 * • Per-write size cap ({@link #MAX_CACHE_BYTES}) so a misbehaving
 *   loader can't fill Redis with a single multi-megabyte blob. We
 *   skip the write past the cap and return the value live; the next
 *   call will simply recompute.
 * • Cache hit/miss is logged at DEBUG so an operator can audit
 *   effectiveness via `grep ResponseCache` without standing up
 *   metric plumbing. The namespace is the only stable bucket name —
 *   `key` is hashed in production logs by upstream loggers if it
 *   contains user-supplied bytes.
 * • Loader exceptions propagate verbatim — they're the caller's
 *   responsibility, the cache neither swallows nor rewraps them.
 *   Only the Redis layer is fail-open.
 */
@Component
public class ResponseCache {

    private static final Logger log = LoggerFactory.getLogger(ResponseCache.class);

    /**
     * Hard upper bound (256 KB) on a single cached payload. Larger
     * loader returns are still served live, just not memoised. Picked
     * empirically: every tool result we currently cache (WHOIS,
     * dns-propagation, ct-monitor) fits under 32 KB; 256 KB gives
     * 8× headroom before we drop the value.
     */
    private static final int MAX_CACHE_BYTES = 256 * 1024;

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper = new ObjectMapper();

    public ResponseCache(StringRedisTemplate redis) { this.redis = redis; }

    public <T> T get(String namespace, String key, Class<T> type, Duration ttl, Supplier<T> loader) {
        String redisKey = namespace + ":" + key;
        try {
            String cached = redis.opsForValue().get(redisKey);
            if (cached != null) {
                T hit = mapper.readValue(cached, type);
                log.debug("cache hit ns={} bytes={}", namespace, cached.length());
                return hit;
            }
        } catch (Exception ignored) {
            // Cache read failed — degrade to live fetch. Never bubble
            // a Redis-class exception up to the controller; the user
            // would see a 500 for what should be a transparent miss.
        }

        T value = loader.get();
        try {
            String json = mapper.writeValueAsString(value);
            // UTF-8 byte length, not String.length(), is what Redis
            // actually stores. Cheap to compute and right by definition.
            int size = json.getBytes(StandardCharsets.UTF_8).length;
            if (size > MAX_CACHE_BYTES) {
                log.warn(
                    "cache write skipped: payload too large ns={} bytes={} cap={}",
                    namespace, size, MAX_CACHE_BYTES);
            } else {
                redis.opsForValue().set(redisKey, json, ttl);
                log.debug("cache miss ns={} bytes={} ttlSec={}",
                    namespace, size, ttl.toSeconds());
            }
        } catch (Exception ignored) {
            // Cache write failed — value was computed and is being
            // returned anyway, so swallow.
        }
        return value;
    }
}
