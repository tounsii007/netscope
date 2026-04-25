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

    /**
     * Resolve the rate-limit key for this request.
     *
     * Security: we only trust X-Forwarded-For when the request actually came
     * from a known internal proxy (load balancer / ingress controller). Without
     * this guard, an attacker spraying random XFF values per request bypasses
     * per-IP rate limits entirely:
     *
     *     for i in {1..10000}; do
     *       curl -H "X-Forwarded-For: $RANDOM.$RANDOM.$RANDOM.$RANDOM" ...
     *     done
     *
     * In a properly-configured Spring Boot deployment the
     * {@code server.forward-headers-strategy} property + Tomcat's RemoteIpValve
     * already strip and re-issue these headers, so {@link HttpServletRequest#getRemoteAddr()}
     * returns the real client IP. We use {@code getRemoteAddr()} as the trusted
     * source and ignore raw XFF in the rate-limit key.
     */
    String clientIp(HttpServletRequest req) {
        // Trust only what Tomcat's RemoteIpValve / Spring forward-headers
        // already validated. RAW X-Forwarded-For from the network is ignored
        // here because it's spoofable per request.
        String addr = req.getRemoteAddr();
        return addr != null && !addr.isBlank() ? addr : "unknown";
    }
}
