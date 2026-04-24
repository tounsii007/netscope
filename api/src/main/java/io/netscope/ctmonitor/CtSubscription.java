package io.netscope.ctmonitor;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ct_subscriptions")
public class CtSubscription {
    @Id @GeneratedValue private UUID id;
    @Column(name = "workspace_id", nullable = false) private UUID workspaceId;
    @Column(nullable = false) private String domain;
    @Column(name = "alert_email") private String alertEmail;
    @Column(name = "last_seen_id") private Long lastSeenId;
    @Column(name = "last_checked_at") private Instant lastCheckedAt;
    @Column(name = "created_at") private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; } public void setWorkspaceId(UUID w) { this.workspaceId = w; }
    public String getDomain() { return domain; } public void setDomain(String d) { this.domain = d; }
    public String getAlertEmail() { return alertEmail; } public void setAlertEmail(String a) { this.alertEmail = a; }
    public Long getLastSeenId() { return lastSeenId; } public void setLastSeenId(Long l) { this.lastSeenId = l; }
    public void setLastCheckedAt(Instant t) { this.lastCheckedAt = t; }
}
