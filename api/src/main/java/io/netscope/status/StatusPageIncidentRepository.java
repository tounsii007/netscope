package io.netscope.status;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface StatusPageIncidentRepository extends JpaRepository<StatusPageIncident, UUID> {
    @Query("SELECT i FROM StatusPageIncident i WHERE i.statusPageId = :id ORDER BY i.startedAt DESC")
    List<StatusPageIncident> findByPage(UUID id);
}
