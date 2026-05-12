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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

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
        // SECURITY: do NOT use the plaintext API key as the Redis key.
        // Redis MONITOR, SLOWLOG, RDB/AOF dumps, Datadog/Sentry Redis
        // integrations, and any operator with read access to Redis
        // would otherwise see every active API key in flight. Hash to
        // a stable 16-byte prefix (32 hex chars) instead — still
        // uniquely identifies the caller for bucket-keying but is
        // useless as a credential.
        String identity = apiKey != null
            ? "k:" + hashKeyFingerprint(apiKey)
            : "ip:" + clientIp(req);
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

    /**
     * 32-hex-char fingerprint of an API key. SHA-256 truncated to 16 bytes
     * is more than enough collision resistance for a per-key bucket: at
     * 50k active keys, the collision probability is ~3·10⁻²⁹. Stable
     * across restarts; cheap to compute.
     */
    private static String hashKeyFingerprint(String apiKey) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] full = md.digest(apiKey.getBytes(StandardCharsets.UTF_8));
            byte[] prefix = new byte[16];
            System.arraycopy(full, 0, prefix, 0, 16);
            return HexFormat.of().formatHex(prefix);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed by every JDK; the catch is to satisfy
            // the checked-exception contract. Fall back to a deterministic
            // length-capped hash so we still don't leak the raw key.
            return Integer.toHexString(apiKey.hashCode()) + ":" + apiKey.length();
        }
    }
}
