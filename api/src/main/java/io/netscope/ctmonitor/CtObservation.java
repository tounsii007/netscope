package io.netscope.ctmonitor;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "ct_observations")
public class CtObservation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "subscription_id", nullable = false) private UUID subscriptionId;
    @Column(name = "crtsh_id", nullable = false) private Long crtshId;
    private String issuer;
    private String subject;
    @JdbcTypeCode(SqlTypes.ARRAY) @Column(columnDefinition = "text[]") private List<String> sans;
    @Column(name = "not_before") private Instant notBefore;
    @Column(name = "not_after") private Instant notAfter;
    @Column(name = "observed_at") private Instant observedAt = Instant.now();

    public CtObservation() {}
    public CtObservation(UUID sub, Long crtshId, String issuer, String subject,
                         List<String> sans, Instant notBefore, Instant notAfter) {
        this.subscriptionId = sub; this.crtshId = crtshId;
        this.issuer = issuer; this.subject = subject; this.sans = sans;
        this.notBefore = notBefore; this.notAfter = notAfter;
    }
    public Long getId() { return id; }
    public Long getCrtshId() { return crtshId; }
    public String getSubject() { return subject; }
    public List<String> getSans() { return sans; }
    public Instant getNotBefore() { return notBefore; }
    public Instant getNotAfter() { return notAfter; }
}
