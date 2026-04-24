package io.netscope.auth;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "api_keys")
public class ApiKey {
    @Id @GeneratedValue private UUID id;
    @Column(name = "key_hash", nullable = false, unique = true) private String keyHash;
    private String name;
    @Column(nullable = false) private String plan = "free";
    @Column(name = "rate_limit", nullable = false) private int rateLimit = 600;
    @Column(name = "owner_email") private String ownerEmail;
    @Column(nullable = false) private boolean active = true;
    @Column(name = "created_at") private Instant createdAt = Instant.now();
    @Column(name = "last_used_at") private Instant lastUsedAt;

    public UUID getId() { return id; }
    public String getKeyHash() { return keyHash; }
    public void setKeyHash(String h) { this.keyHash = h; }
    public String getPlan() { return plan; }
    public int getRateLimit() { return rateLimit; }
    public boolean isActive() { return active; }
    public void setLastUsedAt(Instant t) { this.lastUsedAt = t; }
}
