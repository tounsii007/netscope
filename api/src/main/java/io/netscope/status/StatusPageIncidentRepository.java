package io.netscope.status;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface StatusPageIncidentRepository extends JpaRepository<StatusPageIncident, UUID> {
    /**
     * All incidents for a status page, newest first. Used by admin/owner
     * dashboards that genuinely need the full history.
     *
     * Do NOT call this from the public /status-pages/public/{slug}
     * endpoint — that one needs the bounded version below so a noisy
     * year-old page doesn't return MB of incidents to every anonymous
     * viewer on every cache miss.
     */
    @Query("SELECT i FROM StatusPageIncident i WHERE i.statusPageId = :id ORDER BY i.startedAt DESC")
    List<StatusPageIncident> findByPage(UUID id);

    /**
     * Most-recent N incidents for a status page. The {@link Pageable}
     * is used purely for its limit + offset; ordering is hard-coded in
     * the @Query so callers can't accidentally request the
     * oldest-first slice. Use this on every public/uncached path.
     */
    @Query("SELECT i FROM StatusPageIncident i WHERE i.statusPageId = :id ORDER BY i.startedAt DESC")
    List<StatusPageIncident> findRecentByPage(UUID id, Pageable pageable);
}
