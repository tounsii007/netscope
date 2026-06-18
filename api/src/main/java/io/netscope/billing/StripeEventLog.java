package io.netscope.billing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * F-RD4-06 — Append-only log of Stripe event IDs we have already
 * processed. Stripe's at-least-once delivery means we must treat
 * webhook handlers as idempotent. The dedicated event-id table is the
 * cheapest way to do this: a single PK lookup decides whether to apply
 * or short-circuit, and the unique constraint on {@code event_id} means
 * a race where two replicas process the same event still ends with one
 * apply + one PK violation (caught and swallowed).
 *
 * <p>Stripe event IDs are {@code evt_*} strings (max 255 chars per the
 * Stripe docs). We size the column at 64 because every Stripe event ID
 * observed in production is well under that and the index entries stay
 * small.
 */
@Entity
@Table(name = "stripe_event_log")
public class StripeEventLog {

    /** Stripe event ID, e.g. {@code evt_1NABC123...}. */
    @Id
    @Column(name = "event_id", length = 64, nullable = false)
    private String eventId;

    /** Stripe event type, e.g. {@code customer.subscription.updated}. Persisted for debug only. */
    @Column(name = "event_type", length = 64)
    private String eventType;

    /** Server-side timestamp of when we applied this event. */
    @Column(name = "applied_at", nullable = false)
    private Instant appliedAt = Instant.now();

    public StripeEventLog() {}

    public StripeEventLog(String eventId, String eventType) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.appliedAt = Instant.now();
    }

    public String getEventId() { return eventId; }
    public void setEventId(String e) { this.eventId = e; }

    public String getEventType() { return eventType; }
    public void setEventType(String t) { this.eventType = t; }

    public Instant getAppliedAt() { return appliedAt; }
    public void setAppliedAt(Instant a) { this.appliedAt = a; }
}
