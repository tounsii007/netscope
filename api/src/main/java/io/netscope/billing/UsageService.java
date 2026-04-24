package io.netscope.billing;

import jakarta.persistence.EntityManager;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Usage accounting via INSERT ... ON CONFLICT DO UPDATE. Called async from the
 * rate-limit filter so it never blocks a request. Rolls up per hour, per
 * workspace, per endpoint class.
 */
@Service
public class UsageService {

    private final EntityManager em;
    public UsageService(EntityManager em) { this.em = em; }

    @Async
    @Transactional
    public void record(UUID workspaceId, String endpointClass) {
        if (workspaceId == null) return;
        Instant bucket = Instant.now().truncatedTo(ChronoUnit.HOURS);
        em.createNativeQuery("""
            INSERT INTO usage_counters (workspace_id, hour_bucket, endpoint, count)
            VALUES (:ws, :bucket, :ep, 1)
            ON CONFLICT (workspace_id, hour_bucket, endpoint)
            DO UPDATE SET count = usage_counters.count + 1
            """)
            .setParameter("ws", workspaceId)
            .setParameter("bucket", bucket)
            .setParameter("ep", endpointClass)
            .executeUpdate();
    }

    public static String classify(String path) {
        if (path == null || !path.startsWith("/api/v1/")) return "other";
        String rest = path.substring("/api/v1/".length());
        int slash = rest.indexOf('/');
        String first = slash < 0 ? rest : rest.substring(0, slash);
        return first.isBlank() ? "other" : first;
    }
}
