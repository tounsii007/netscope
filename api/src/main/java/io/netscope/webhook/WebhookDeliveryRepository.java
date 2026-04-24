package io.netscope.webhook;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface WebhookDeliveryRepository extends JpaRepository<WebhookDelivery, UUID> {
    @Query("""
        SELECT d FROM WebhookDelivery d
        WHERE d.succeededAt IS NULL AND d.deadAt IS NULL AND d.nextRetryAt <= :now
        ORDER BY d.nextRetryAt ASC
        """)
    List<WebhookDelivery> pending(Instant now, Pageable limit);

    List<WebhookDelivery> findByWebhookIdOrderByCreatedAtDesc(UUID webhookId, Pageable limit);
}
