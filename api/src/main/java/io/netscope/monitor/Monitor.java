package io.netscope.monitor;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "monitors")
public class Monitor {
    @Id @GeneratedValue private UUID id;
    @Column(name = "api_key_id") private UUID apiKeyId;
    @Column(nullable = false) private String name;
    @Column(nullable = false) private String type; // http, tcp, ping
    @Column(nullable = false) private String target;
    private Integer port;
    @Column(name = "interval_sec", nullable = false) private int intervalSec = 300;
    @Column(nullable = false) private boolean enabled = true;
    @Column(name = "alert_email") private String alertEmail;
    @Column(name = "created_at") private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public String getName() { return name; } public void setName(String n) { this.name = n; }
    public String getType() { return type; } public void setType(String t) { this.type = t; }
    public String getTarget() { return target; } public void setTarget(String t) { this.target = t; }
    public Integer getPort() { return port; } public void setPort(Integer p) { this.port = p; }
    public int getIntervalSec() { return intervalSec; } public void setIntervalSec(int i) { this.intervalSec = i; }
    public boolean isEnabled() { return enabled; } public void setEnabled(boolean e) { this.enabled = e; }
    public String getAlertEmail() { return alertEmail; }
    public void setApiKeyId(UUID id) { this.apiKeyId = id; }
    public UUID getApiKeyId() { return apiKeyId; }
}
