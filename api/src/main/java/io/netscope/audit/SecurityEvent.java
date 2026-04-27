package io.netscope.audit;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "security_events")
public class SecurityEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(nullable = false) private String severity;
    // Stored as VARCHAR(45) (V4 migration). INET would require a custom
    // Hibernate JdbcType to avoid "type varchar vs inet" rejections on insert.
    @Column(name = "client_ip", length = 45) private String clientIp;
    @Column(name = "api_key_id") private UUID apiKeyId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb")
    private Map<String, Object> details;
    @Column(name = "created_at") private Instant createdAt = Instant.now();

    public SecurityEvent() {}
    public SecurityEvent(String eventType, String severity, String clientIp, UUID apiKeyId, Map<String, Object> details) {
        this.eventType = eventType; this.severity = severity;
        this.clientIp = clientIp; this.apiKeyId = apiKeyId; this.details = details;
    }
}
