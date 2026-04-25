package io.netscope.webhook;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WebhookRepository extends JpaRepository<Webhook, UUID> {
    List<Webhook> findByWorkspaceIdAndActiveTrue(UUID workspaceId);
    List<Webhook> findByWorkspaceId(UUID workspaceId);

    /**
     * Authorisation-safe lookup: returns empty when the row does not exist
     * OR when it exists but belongs to a different workspace. Used in the
     * delete + history endpoints so a cross-workspace attacker cannot
     * distinguish 403 from 404 by response timing.
     */
    Optional<Webhook> findByIdAndWorkspaceId(UUID id, UUID workspaceId);
}
