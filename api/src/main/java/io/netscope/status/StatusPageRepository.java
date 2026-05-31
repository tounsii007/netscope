package io.netscope.status;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StatusPageRepository extends JpaRepository<StatusPage, UUID> {
    Optional<StatusPage> findBySlug(String slug);
    List<StatusPage> findByWorkspaceId(UUID workspaceId);

    /**
     * F-RD4-04 (LOW): existence-safe public lookup. Returns empty when the
     * slug does not exist OR when it exists but is marked private. The
     * public unauth'd endpoint MUST collapse "no such page" and
     * "private page exists" into the same 404 so an anonymous attacker
     * cannot enumerate slugs to confirm which private pages exist (and
     * therefore which workspaces use the product, internal codename
     * leakage, etc.).
     *
     * Previously the controller did findBySlug → if (!publicAccess) 403,
     * which returned a distinguishable response for private-but-existing
     * pages. This collapses the check into a single SQL query.
     */
    Optional<StatusPage> findBySlugAndPublicAccessTrue(String slug);

    /**
     * F-RD4-03 (LOW): authorisation-safe lookup. Returns empty (→ 404) when
     * the row does not exist OR when it exists in a workspace the caller
     * does not belong to. Atomic in a single SQL query — no time gap
     * between read and ownership check, so a cross-tenant attacker
     * cannot distinguish "not yours" (403) from "doesn't exist" (404).
     *
     * Mirrors the {@code MonitorRepository.findByIdAndApiKeyId} idiom but
     * scopes through workspace membership instead of an API key.
     */
    @Query("""
        SELECT p FROM StatusPage p
        WHERE p.id = :id
          AND p.workspaceId IN (
              SELECT m.workspaceId FROM WorkspaceMember m WHERE m.userId = :userId
          )
        """)
    Optional<StatusPage> findByIdAndCallerUserId(@Param("id") UUID id, @Param("userId") UUID userId);

    /**
     * F-RD4-03 (LOW): atomic lookup scoped to a single workspace. Use this
     * when the caller has already pinned a specific workspaceId. For
     * controllers that only have the caller's identity in hand, prefer
     * {@link #findByIdAndCallerUserId}.
     */
    Optional<StatusPage> findByIdAndWorkspaceId(UUID id, UUID workspaceId);
}
