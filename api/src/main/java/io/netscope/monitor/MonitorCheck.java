package io.netscope.monitor;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "monitor_checks")
public class MonitorCheck {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "monitor_id", nullable = false) private UUID monitorId;
    @Column(nullable = false) private boolean up;
    @Column(name = "latency_ms") private Integer latencyMs;
    @Column(name = "status_code") private Integer statusCode;
    private String error;
    @Column(name = "checked_at") private Instant checkedAt = Instant.now();

    public MonitorCheck() {}
    public MonitorCheck(UUID monitorId, boolean up, Integer latencyMs, Integer statusCode, String error) {
        this.monitorId = monitorId; this.up = up; this.latencyMs = latencyMs;
        this.statusCode = statusCode; this.error = error;
    }
    public Long getId() { return id; }
    public boolean isUp() { return up; }
    public Integer getLatencyMs() { return latencyMs; }
    public Instant getCheckedAt() { return checkedAt; }
}
