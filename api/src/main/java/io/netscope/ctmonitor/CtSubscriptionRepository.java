package io.netscope.ctmonitor;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CtSubscriptionRepository extends JpaRepository<CtSubscription, UUID> {
    List<CtSubscription> findByWorkspaceId(UUID workspaceId);
    Optional<CtSubscription> findByWorkspaceIdAndDomain(UUID workspaceId, String domain);

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
