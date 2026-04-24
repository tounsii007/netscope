package io.netscope.scan;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "scans")
public class Scan {
    @Id @GeneratedValue private UUID id;
    private String tool;
    private String target;
    @Column(name = "client_ip", columnDefinition = "inet") private String clientIp;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> result;
    @Column(name = "duration_ms") private Integer durationMs;
    @Column(name = "created_at") private Instant createdAt = Instant.now();

    public Scan() {}
    public Scan(String tool, String target, String clientIp, Map<String, Object> result, int durationMs) {
        this.tool = tool; this.target = target; this.clientIp = clientIp;
        this.result = result; this.durationMs = durationMs;
    }
    public UUID getId() { return id; }
}
