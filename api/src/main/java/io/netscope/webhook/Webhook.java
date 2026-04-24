package io.netscope.webhook;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "webhooks")
public class Webhook {
    @Id @GeneratedValue private UUID id;
    @Column(name = "workspace_id", nullable = false) private UUID workspaceId;
    @Column(nullable = false) private String url;
    @Column(nullable = false) private String secret;
    @JdbcTypeCode(SqlTypes.ARRAY) @Column(nullable = false, columnDefinition = "text[]")
    private List<String> events;
    @Column(nullable = false) private String kind = "generic";
    @Column(nullable = false) private boolean active = true;
    @Column(name = "created_at") private Instant createdAt = Instant.now();
    @Column(name = "last_success_at") private Instant lastSuccessAt;
    @Column(name = "last_failure_at") private Instant lastFailureAt;

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; } public void setWorkspaceId(UUID w) { this.workspaceId = w; }
    public String getUrl() { return url; } public void setUrl(String u) { this.url = u; }
    public String getSecret() { return secret; } public void setSecret(String s) { this.secret = s; }
    public List<String> getEvents() { return events; } public void setEvents(List<String> e) { this.events = e; }
    public String getKind() { return kind; } public void setKind(String k) { this.kind = k; }
    public boolean isActive() { return active; } public void setActive(boolean a) { this.active = a; }
    public void setLastSuccessAt(Instant t) { this.lastSuccessAt = t; }
    public void setLastFailureAt(Instant t) { this.lastFailureAt = t; }
}
