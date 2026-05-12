package io.netscope.auth;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;

/**
 * Separate bean so the {@code @Async} on touch() actually takes effect.
 *
 * Spring's {@code @Async} is proxy-based: a self-invocation from
 * {@link ApiKeyService#resolve(String)} would call {@code this.touch(...)}
 * directly on the target bean, bypassing the CGLib proxy that
 * implements the async dispatch. Net effect on the previous code:
 * the {@code lastUsedAt} update + repo.save() ran SYNCHRONOUSLY on
 * every authenticated request, paying the Postgres roundtrip latency
 * inline in the request critical path.
 *
 * By housing touch() in a separate {@code @Service} that
 * ApiKeyService injects, the call site goes through the proxy and
 * the annotation finally activates.
 */
@Service
public class ApiKeyTouchService {

    private final ApiKeyRepository repo;

    public ApiKeyTouchService(ApiKeyRepository repo) { this.repo = repo; }

    /**
     * Update {@code lastUsedAt} to now and persist. Runs on the Spring
     * async executor; failures are swallowed so a flaky DB write never
     * fails the live request that triggered it.
     */
    @Async
    public void touch(ApiKey key) {
        try {
            key.setLastUsedAt(Instant.now());
            repo.save(key);
        } catch (Exception ignored) {
            // Touch is best-effort. The user already authenticated;
            // missing a lastUsedAt update is not worth surfacing.
        }
    }
}
