package io.netscope.ctmonitor;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CtSubscriptionRepository extends JpaRepository<CtSubscription, UUID> {
    List<CtSubscription> findByWorkspaceId(UUID workspaceId);
    Optional<CtSubscription> findByWorkspaceIdAndDomain(UUID workspaceId, String domain);
}
