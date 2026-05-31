package io.netscope.common.ratelimit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Per-request rate-limit gate. Two tiers:
 *
 *   • Global tier — every /api/ call, keyed by API-key fingerprint or
 *     by validated client IP.
 *   • Auth-endpoint tier — anonymous /api/v1/auth/** calls get a
 *     stricter dedicated bucket to throttle credential stuffing.
 *
 * Substantive logic delegated to:
 *   • {@link SlidingWindowCounter}     — Cloudflare-formula weighted counter
 *   • {@link RateLimitIdentity}        — bucket-key resolution
 *   • {@link TooManyRequestsResponse}  — 429 envelope writer
 *
 * Fail-open semantics on Redis errors: a wedged Redis must never lock
 * legitimate users out — we'd rather take an over-the-budget burst than
 * deny everyone for the duration of the incident.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    @Value("${netscope.rate-limit.anonymous-per-minute}")
    private int anonPerMinute;

    @Value("${netscope.rate-limit.authenticated-per-minute}")
    private int authPerMinute;

    /** Tighter anti-credential-stuffing limit on /api/v1/auth/**.
     *  Defaults to 10 if unset so a deployment that forgets to
     *  configure it still gets the protection. */
    @Value("${netscope.rate-limit.auth-endpoint-per-minute:10}")
    private int authEndpointPerMinute;

    private final SlidingWindowCounter counter;

    public RateLimitFilter(StringRedisTemplate redis) {
        this.counter = new SlidingWindowCounter(redis);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        // F-RD5-02: CORS preflight (OPTIONS) is browser-mandated and
        // unauthenticated by spec — the browser sends it before the
        // actual cross-origin request, with no credentials and no body.
        // Counting it against the auth-endpoint bucket would let any
        // cross-origin page burn the credential-stuffing budget just
        // by triggering preflights, locking real sign-in attempts out.
        // SecurityConfig already permitAll's OPTIONS; skip the limiter
        // here so the bucket reflects real auth traffic only.
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) {
            chain.doFilter(req, res);
            return;
        }

        String path = req.getRequestURI();
        if (!path.startsWith("/api/")) { chain.doFilter(req, res); return; }

        String apiKey = req.getHeader("X-API-Key");
        String identity = RateLimitIdentity.of(req, apiKey);
        int limit = apiKey != null ? authPerMinute : anonPerMinute;

        long nowMs = System.currentTimeMillis();
        long windowStart = nowMs / 60_000;
        long resetEpochSec = (windowStart + 1L) * 60L;

        if (apiKey == null && path.startsWith("/api/v1/auth/")
            && !enforceAuthTier(req, res, windowStart, nowMs, resetEpochSec)) {
            return;
        }

        SlidingWindowCounter.Result sw;
        try {
            sw = counter.check("rl:" + identity, windowStart, nowMs, limit);
        } catch (Exception e) {
            // fail-open: Redis down → allow.
            chain.doFilter(req, res);
            return;
        }
        long remaining = Math.max(0, limit - sw.effectiveCount());
        res.setHeader("X-RateLimit-Limit",     String.valueOf(limit));
        res.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));
        res.setHeader("X-RateLimit-Reset",     String.valueOf(resetEpochSec));

        if (sw.exceeded()) {
            TooManyRequestsResponse.write(res, limit, resetEpochSec, "rate limit exceeded");
            return;
        }
        chain.doFilter(req, res);
    }

    /** Returns true if the request should continue down the chain;
     *  false when a 429 has already been written. */
    private boolean enforceAuthTier(HttpServletRequest req, HttpServletResponse res,
            long windowStart, long nowMs, long resetEpochSec) throws IOException {
        String prefix = "rl:auth:" + RateLimitIdentity.clientIp(req);
        SlidingWindowCounter.Result sw;
        try {
            sw = counter.check(prefix, windowStart, nowMs, authEndpointPerMinute);
        } catch (Exception e) {
            // Fail-open: a wedged Redis must NOT lock people out of
            // their own login flow. Better an over-budget burst than
            // a total freeze during a Redis incident.
            return true;
        }
        if (sw.exceeded()) {
            TooManyRequestsResponse.write(res, authEndpointPerMinute, resetEpochSec,
                "auth endpoint rate limit exceeded");
            return false;
        }
        return true;
    }
}
