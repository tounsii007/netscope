package io.netscope.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;

/**
 * Fixed-window rate limiter backed by Redis INCR + EXPIRE. Works across pods.
 * For stricter semantics we could swap to a sliding-log script; the current
 * approach is cheap and correct enough for abuse prevention.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    @Value("${netscope.rate-limit.anonymous-per-minute}")
    private int anonPerMinute;

    @Value("${netscope.rate-limit.authenticated-per-minute}")
    private int authPerMinute;

    private final StringRedisTemplate redis;

    public RateLimitFilter(StringRedisTemplate redis) { this.redis = redis; }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String path = req.getRequestURI();
        if (!path.startsWith("/api/")) { chain.doFilter(req, res); return; }

        String apiKey = req.getHeader("X-API-Key");
        String identity = apiKey != null ? "k:" + apiKey : "ip:" + clientIp(req);
        int limit = apiKey != null ? authPerMinute : anonPerMinute;

        long windowStart = System.currentTimeMillis() / 60_000;
        String redisKey = "rl:" + identity + ":" + windowStart;

        Long count;
        try {
            count = redis.opsForValue().increment(redisKey);
            if (count != null && count == 1L) {
                redis.expire(redisKey, Duration.ofSeconds(70));
            }
        } catch (Exception e) {
            // fail-open: if Redis is down we allow the request rather than 500 everyone
            chain.doFilter(req, res);
            return;
        }

        long remaining = Math.max(0, limit - (count == null ? 0 : count));
        res.setHeader("X-RateLimit-Limit", String.valueOf(limit));
        res.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));

        if (count != null && count > limit) {
            res.setStatus(429);
            res.setHeader("Retry-After", "60");
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"Too Many Requests\",\"message\":\"rate limit exceeded\"}");
            return;
        }
        chain.doFilter(req, res);
    }

    private String clientIp(HttpServletRequest req) {
        String fwd = req.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        return req.getRemoteAddr();
    }
}
