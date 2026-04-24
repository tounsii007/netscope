package io.netscope.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.function.Supplier;

/**
 * Simple Redis-backed response cache with JSON serialization. Use for idempotent
 * GET operations whose results are expensive and tolerable to stale for a few
 * minutes. Falls back to live fetch if Redis misbehaves.
 */
@Component
public class ResponseCache {

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper = new ObjectMapper();

    public ResponseCache(StringRedisTemplate redis) { this.redis = redis; }

    @SuppressWarnings("unchecked")
    public <T> T get(String namespace, String key, Class<T> type, Duration ttl, Supplier<T> loader) {
        String redisKey = namespace + ":" + key;
        try {
            String cached = redis.opsForValue().get(redisKey);
            if (cached != null) return mapper.readValue(cached, type);
        } catch (Exception ignored) {}

        T value = loader.get();
        try { redis.opsForValue().set(redisKey, mapper.writeValueAsString(value), ttl); }
        catch (Exception ignored) {}
        return value;
    }
}
