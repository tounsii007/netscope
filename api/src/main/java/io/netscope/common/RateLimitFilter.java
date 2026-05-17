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

    /**
     * Tighter anti-credential-stuffing limit on /api/v1/auth/**.
     *
     * Falls on top of the global anonymous limit: an attacker
     * spraying 30 login attempts a minute would still trip the
     * global bucket eventually, but this dedicated tier kicks in
     * much sooner — typically 10 attempts/min from one IP.
     *
     * Defaults to 10 if unset so a deployment that forgets to
     * configure the value still gets the protection.
     */
    @Value("${netscope.rate-limit.auth-endpoint-per-minute:10}")
    private int authEndpointPerMinute;

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

        long nowMs = System.currentTimeMillis();
        long windowStart = nowMs / 60_000;
        // Unix-epoch seconds at the start of the NEXT window. Browsers
        // and clients use this for X-RateLimit-Reset to schedule retry
        // without sticking to a polled "Retry-After: 60" countdown.
        long resetEpochSec = (windowStart + 1L) * 60L;
        String redisKey = "rl:" + identity + ":" + windowStart;

        // ─── Auth-endpoint tier (anti-credential-stuffing) ────────────
        // Anonymous calls to /api/v1/auth/** are extra-budgeted: they
        // pass BOTH the dedicated auth-tier bucket AND the global
        // anonymous bucket. API-key callers skip the auth tier — a
        // legitimate scripted client that holds a key has already
        // proven its identity.
        boolean isAuthEndpoint = apiKey == null && path.startsWith("/api/v1/auth/");
        if (isAuthEndpoint) {
            String authKey = "rl:auth:" + clientIp(req) + ":" + windowStart;
            Long authCount;
            try {
                authCount = redis.opsForValue().increment(authKey);
                if (authCount != null && authCount == 1L) {
                    redis.expire(authKey, Duration.ofSeconds(70));
                }
            } catch (Exception e) {
                // fail-open: if Redis is down we never block auth — a
                // wedged Redis must not lock people out of their account
                chain.doFilter(req, res);
                return;
            }
            if (authCount != null && authCount > authEndpointPerMinute) {
                writeTooManyRequests(res, authEndpointPerMinute, resetEpochSec,
                    "auth endpoint rate limit exceeded");
                return;
            }
        }

        // ─── Global tier ──────────────────────────────────────────────
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
        res.setHeader("X-RateLimit-Reset", String.valueOf(resetEpochSec));

        if (count != null && count > limit) {
            writeTooManyRequests(res, limit, resetEpochSec, "rate limit exceeded");
            return;
        }
        chain.doFilter(req, res);
    }

    /**
     * Centralised 429 emitter so both tiers respond consistently:
     * status 429, Retry-After in seconds (legacy clients), and the
     * full X-RateLimit-* triplet (modern clients). The body is a
     * tiny JSON object so SPA error handlers can branch on `error`
     * without parsing free-text.
     */
    private static void writeTooManyRequests(
            HttpServletResponse res, int limit, long resetEpochSec, String reason)
            throws IOException {
        long retryAfterSec = Math.max(1L,
            resetEpochSec - (System.currentTimeMillis() / 1000L));
        res.setStatus(429);
        res.setHeader("Retry-After", String.valueOf(retryAfterSec));
        res.setHeader("X-RateLimit-Limit", String.valueOf(limit));
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", String.valueOf(resetEpochSec));
        res.setContentType("application/json");
        res.getWriter().write(
            "{\"error\":\"Too Many Requests\",\"message\":\"" + reason + "\"}");
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
