package io.netscope.monitor;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MonitorRepository extends JpaRepository<Monitor, UUID> {
    List<Monitor> findByEnabledTrue();
    List<Monitor> findByApiKeyId(UUID apiKeyId);

    /**
     * Authorisation-safe lookup: returns empty (→ 404) when the row does not
     * exist OR when it exists but is owned by a different API key.
     *
     * Atomic in a single SQL query — no time gap between read and check, so
     * a timing attack cannot distinguish "not yours" from "doesn't exist".
     */
    Optional<Monitor> findByIdAndApiKeyId(java.util.UUID id, java.util.UUID apiKeyId);
}
