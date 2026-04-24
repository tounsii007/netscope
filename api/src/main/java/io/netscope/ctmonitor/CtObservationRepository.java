package io.netscope.ctmonitor;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CtObservationRepository extends JpaRepository<CtObservation, Long> {
    List<CtObservation> findTop50BySubscriptionIdOrderByObservedAtDesc(UUID subId);
}
