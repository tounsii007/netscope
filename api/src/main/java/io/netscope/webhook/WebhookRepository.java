package io.netscope.webhook;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface WebhookRepository extends JpaRepository<Webhook, UUID> {
    List<Webhook> findByWorkspaceIdAndActiveTrue(UUID workspaceId);
    List<Webhook> findByWorkspaceId(UUID workspaceId);
}
