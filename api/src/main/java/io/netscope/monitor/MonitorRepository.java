package io.netscope.monitor;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MonitorRepository extends JpaRepository<Monitor, UUID> {
    /**
     * @deprecated Pulls every enabled monitor into memory. Used by the
     *             admin export / debug paths only. The scheduler uses
     *             {@link #findEnabledPage(Pageable)} to page through.
     */
    @Deprecated
    List<Monitor> findByEnabledTrue();

    /**
     * Page through enabled monitors. The scheduler walks the table in
     * fixed-size pages every 30 s so a 100 k-monitor table doesn't
     * materialise a 100 k-element list per tick. Newest-first is fine
     * for fairness: every page eventually gets visited within the
     * scheduler's loop and the per-monitor lock-acquire short-circuits
     * monitors that aren't due yet.
     */
    @Query("SELECT m FROM Monitor m WHERE m.enabled = true ORDER BY m.id ASC")
    List<Monitor> findEnabledPage(Pageable pageable);

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
