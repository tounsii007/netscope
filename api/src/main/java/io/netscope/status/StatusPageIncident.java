package io.netscope.status;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "status_page_incidents")
public class StatusPageIncident {
    public enum Status { INVESTIGATING, IDENTIFIED, MONITORING, RESOLVED }
    public enum Impact { NONE, MINOR, MAJOR, CRITICAL }

    @Id @GeneratedValue private UUID id;
    @Column(name = "status_page_id", nullable = false) private UUID statusPageId;
    @Column(nullable = false) private String title;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Status status = Status.INVESTIGATING;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Impact impact = Impact.MINOR;
    private String body;
    @Column(name = "started_at") private Instant startedAt = Instant.now();
    @Column(name = "resolved_at") private Instant resolvedAt;

    public UUID getId() { return id; }
    public UUID getStatusPageId() { return statusPageId; } public void setStatusPageId(UUID id) { this.statusPageId = id; }
    public String getTitle() { return title; } public void setTitle(String t) { this.title = t; }
    public Status getStatus() { return status; } public void setStatus(Status s) { this.status = s; }
    public Impact getImpact() { return impact; } public void setImpact(Impact i) { this.impact = i; }
    public String getBody() { return body; } public void setBody(String b) { this.body = b; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getResolvedAt() { return resolvedAt; } public void setResolvedAt(Instant r) { this.resolvedAt = r; }
}
