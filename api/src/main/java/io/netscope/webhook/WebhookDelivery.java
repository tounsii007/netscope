package io.netscope.webhook;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "webhook_deliveries")
public class WebhookDelivery {
    @Id @GeneratedValue private UUID id;
    @Column(name = "webhook_id", nullable = false) private UUID webhookId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> payload;
    @Column(nullable = false) private int attempt = 0;
    @Column(name = "status_code") private Integer statusCode;
    @Column(name = "response_body") private String responseBody;
    @Column(name = "next_retry_at") private Instant nextRetryAt = Instant.now();
    @Column(name = "succeeded_at") private Instant succeededAt;
    @Column(name = "dead_at") private Instant deadAt;
    @Column(name = "created_at") private Instant createdAt = Instant.now();

    public WebhookDelivery() {}
    public WebhookDelivery(UUID webhookId, String eventType, Map<String, Object> payload) {
        this.webhookId = webhookId; this.eventType = eventType; this.payload = payload;
    }
    public UUID getId() { return id; }
    public UUID getWebhookId() { return webhookId; }
    public String getEventType() { return eventType; }
    public Map<String, Object> getPayload() { return payload; }
    public int getAttempt() { return attempt; } public void setAttempt(int a) { this.attempt = a; }
    public void setStatusCode(Integer s) { this.statusCode = s; }
    public void setResponseBody(String b) { this.responseBody = b == null || b.length() < 500 ? b : b.substring(0, 500); }
    public Instant getNextRetryAt() { return nextRetryAt; } public void setNextRetryAt(Instant t) { this.nextRetryAt = t; }
    public void setSucceededAt(Instant t) { this.succeededAt = t; }
    public void setDeadAt(Instant t) { this.deadAt = t; }
}
