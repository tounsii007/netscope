package io.netscope.monitor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.UUID;

public interface MonitorCheckRepository extends JpaRepository<MonitorCheck, Long> {
    @Query("SELECT c FROM MonitorCheck c WHERE c.monitorId = :id AND c.checkedAt > :since")
    Page<MonitorCheck> history(UUID id, Instant since, Pageable pageable);
}
