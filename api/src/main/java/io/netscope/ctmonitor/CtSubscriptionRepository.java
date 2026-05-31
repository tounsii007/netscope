package io.netscope.ctmonitor;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CtSubscriptionRepository extends JpaRepository<CtSubscription, UUID> {
    List<CtSubscription> findByWorkspaceId(UUID workspaceId);
    Optional<CtSubscription> findByWorkspaceIdAndDomain(UUID workspaceId, String domain);

    /**
     * F-RD5-06 (HIGH) — Guarded watermark advance. The CT-scheduler runs on
     * every API pod and on the same fixed-delay timer. Without this guard,
     * two pods could both:
     *   read lastSeenId=1000 → poll crt.sh → save() with lastSeenId=1200
     * Last-writer-wins is fine if both saw the same crt.sh result, but the
     * real bug is when pod-A sees crt.sh-up-to-id=1200 and pod-B sees
     * crt.sh-up-to-id=1150 (e.g. behind a CDN cache or staggered crt.sh
     * replicas). Pod-A commits 1200, then pod-B's stale save() rolls the
     * watermark back to 1150 — and the next tick re-alerts on 1150..1200,
     * spamming the customer's webhook + email.
     *
     * <p>The {@code WHERE lastSeenId IS NULL OR lastSeenId < :newSeen}
     * predicate makes the UPDATE a no-op when another pod has already
     * advanced past us. Spring Data returns the JDBC rowcount; caller
     * checks {@code == 1} before publishing events, otherwise it silently
     * drops the duplicate batch (the winning pod will publish them).
     *
     * <p>This is the same race-class fix as F-RD5-05 (webhook delivery
     * lease) — guarded UPDATE + caller-side rowcount check instead of
     * a read-modify-write that loses on contention. Optimistic-locking
     * via {@code @Version} would also work but would force every
     * controller path (subscribe / unsubscribe) to handle
     * {@code OptimisticLockException}; the explicit guard is cheaper.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        UPDATE CtSubscription s
           SET s.lastSeenId    = :newSeen,
               s.lastCheckedAt = :now
         WHERE s.id = :id
           AND (s.lastSeenId IS NULL OR s.lastSeenId < :newSeen)
        """)
    int advanceWatermark(@Param("id") UUID id,
                         @Param("newSeen") Long newSeen,
                         @Param("now") Instant now);

    /**
     * F-RD4-02 (LOW): authorisation-safe lookup. Returns empty (→ 404) when
     * the row does not exist OR when it exists in a workspace the caller
     * does not belong to. Atomic in a single SQL query — no time gap
     * between read and ownership check, so a cross-tenant attacker
     * cannot distinguish "not yours" (403) from "doesn't exist" (404).
     *
     * Mirrors the {@code MonitorRepository.findByIdAndApiKeyId} idiom but
     * scopes through workspace membership instead of an API key.
     */
    @Query("""
        SELECT s FROM CtSubscription s
        WHERE s.id = :id
          AND s.workspaceId IN (
              SELECT m.workspaceId FROM WorkspaceMember m WHERE m.userId = :userId
          )
        """)
    Optional<CtSubscription> findByIdAndCallerUserId(@Param("id") UUID id, @Param("userId") UUID userId);

    /**
     * F-RD4-02 (LOW): atomic lookup scoped to a single workspace. Use this
     * when the caller has already pinned a specific workspaceId (e.g. via
     * an explicit workspace selector in the URL). For controllers that
     * only have the caller's identity in hand, prefer
     * {@link #findByIdAndCallerUserId}.
     */
    Optional<CtSubscription> findByIdAndWorkspaceId(UUID id, UUID workspaceId);
}
