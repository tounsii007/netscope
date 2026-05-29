package io.netscope.common;

import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;

/**
 * Weighted sliding-window counter, backed by two Redis INCR keys per
 * caller.
 *
 * The classic fixed-window approach (single INCR per minute) lets a
 * caller spend their full quota in the last second of minute N and
 * AGAIN in the first second of minute N+1 — effective 2× burst over
 * a 2-second boundary. This counter uses the Cloudflare-published
 * formula:
 *
 *   effective = current_count + previous_count × (1 − position_in_window)
 *
 * where {@code position_in_window} = (now mod 60_000) / 60_000.
 *
 * Properties:
 *   • Approximates true sliding-window to ≈95 % accuracy
 *   • O(1) Redis ops per request (INCR current + GET previous)
 *   • No Lua scripts, no ZSETs
 */
public final class SlidingWindowCounter {

    /** Result of one check: weighted count + whether it tripped limit. */
    public record Result(long effectiveCount, boolean exceeded) {}

    private static final Duration KEY_TTL = Duration.ofSeconds(70);

    private final StringRedisTemplate redis;

    public SlidingWindowCounter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public Result check(String keyPrefix, long windowStart, long nowMs, int limit) {
        String currentKey  = keyPrefix + ":" + windowStart;
        String previousKey = keyPrefix + ":" + (windowStart - 1);

        Long currentCount = redis.opsForValue().increment(currentKey);
        if (currentCount != null && currentCount == 1L) {
            redis.expire(currentKey, KEY_TTL);
        }

        String prevRaw = redis.opsForValue().get(previousKey);
        long previousCount = 0;
        if (prevRaw != null) {
            try { previousCount = Long.parseLong(prevRaw); }
            catch (NumberFormatException ignored) { /* treat as 0 */ }
        }

        double positionInWindow = (nowMs % 60_000L) / 60_000.0;
        double weighted = (currentCount == null ? 0 : currentCount.doubleValue())
            + previousCount * (1.0 - positionInWindow);
        long effective = (long) Math.ceil(weighted);

        return new Result(effective, effective > limit);
    }
}
