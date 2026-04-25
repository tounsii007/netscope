package io.netscope.webhook;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface WebhookDeliveryRepository extends JpaRepository<WebhookDelivery, UUID> {

    /**
     * Pull the next batch of pending deliveries for processing.
     *
     * Race-safe in a horizontally-scaled deployment: multiple Pod replicas
     * call this method on the same fixed-delay schedule. Without locking,
     * Pod-A and Pod-B would both pick up the same 50 rows and POST them
     * concurrently, resulting in DUPLICATE deliveries to customer endpoints.
     *
     *   • {@code @Lock(PESSIMISTIC_WRITE)} acquires SELECT ... FOR UPDATE
     *   • {@code jakarta.persistence.lock.timeout = -2} → SKIP LOCKED, so
     *     a second pod immediately gets the NEXT batch instead of blocking
     *     until the first pod's transaction commits.
     *
     * Wrap the call site in {@code @Transactional} so the lock is held for
     * the duration of the dispatch loop.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints({ @QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2") })
    @Query("""
        SELECT d FROM WebhookDelivery d
        WHERE d.succeededAt IS NULL AND d.deadAt IS NULL AND d.nextRetryAt <= :now
        ORDER BY d.nextRetryAt ASC
        """)
    List<WebhookDelivery> pending(Instant now, Pageable limit);

    List<WebhookDelivery> findByWebhookIdOrderByCreatedAtDesc(UUID webhookId, Pageable limit);
}
