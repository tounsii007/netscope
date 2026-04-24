package io.netscope.billing;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "usage_counters")
@IdClass(UsageCounter.PK.class)
public class UsageCounter {
    @Id @Column(name = "workspace_id") private UUID workspaceId;
    @Id @Column(name = "hour_bucket")  private Instant hourBucket;
    @Id @Column(name = "endpoint")     private String endpoint;
    @Column(nullable = false) private long count;

    public UsageCounter() {}
    public UsageCounter(UUID w, Instant b, String e, long c) {
        this.workspaceId = w; this.hourBucket = b; this.endpoint = e; this.count = c;
    }
    public long getCount() { return count; }

    public static class PK implements Serializable {
        private UUID workspaceId; private Instant hourBucket; private String endpoint;
        public PK() {}
        public PK(UUID w, Instant b, String e) { this.workspaceId = w; this.hourBucket = b; this.endpoint = e; }
        public int hashCode() { return Objects.hash(workspaceId, hourBucket, endpoint); }
        public boolean equals(Object o) {
            return o instanceof PK pk
                && Objects.equals(workspaceId, pk.workspaceId)
                && Objects.equals(hourBucket, pk.hourBucket)
                && Objects.equals(endpoint, pk.endpoint);
        }
    }
}
