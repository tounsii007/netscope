package io.netscope.scan;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Separate Spring bean for the async persistence of scan-audit rows.
 *
 * Why a separate class:
 *   • {@code @Async} is proxy-based. Spring wraps the bean in a CGLib
 *     proxy and reads {@code @Async} on the proxy's method dispatch.
 *     When the aspect previously called {@code this.persist(...)} on
 *     itself, the call bypassed the proxy and ran SYNCHRONOUSLY on
 *     the request thread — exactly what we wanted to avoid.
 *   • By moving persist into a separate {@code @Service} that the
 *     aspect injects, the call site goes through the proxy and the
 *     annotation finally takes effect.
 *
 * The aspect also can't read {@code RequestContextHolder} from the
 * worker thread (the request scope is gone), so it eagerly resolves
 * the client IP on the request thread and passes it as a parameter.
 */
@Service
public class ScanAuditWriter {

    private final ScanRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();

    public ScanAuditWriter(ScanRepository repo) { this.repo = repo; }

    /**
     * Persist a scan audit row. Runs on the Spring async executor;
     * never throws back to the caller. {@code ip} must be resolved
     * by the request-thread before calling because by the time this
     * runs the servlet request scope no longer exists.
     */
    @Async
    public void persist(String tool, String target, String ip, Object result, int durationMs) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> asMap = mapper.convertValue(result, Map.class);
            repo.save(new Scan(tool, target, ip, asMap, durationMs));
        } catch (Exception ignored) {
            // Audit must never break the request — and at this point
            // we're already off-thread, so swallow and move on.
        }
    }
}
