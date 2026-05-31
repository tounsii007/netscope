package io.netscope.billing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * F-RD4-06 — Per-Stripe-customer plan state row.
 *
 * <p>Stripe delivers webhook events <i>at-least-once</i> and <i>without
 * ordering guarantees</i>. Two events for the same customer
 * ({@code customer.subscription.updated} A then B) can arrive on
 * separate Tomcat threads, both read the workspace row, both compute a
 * plan, and the slower writer overwrites the faster one — even if the
 * slower writer is the older Stripe event. Worse, an old retried event
 * (Stripe retries on non-2xx for up to 3 days) can race a fresh event
 * and downgrade an active subscription back to {@code free}.
 *
 * <p>This entity dedicates a row per Stripe customer so the webhook
 * handler can take a {@code SELECT ... FOR UPDATE} row lock during the
 * upsert, and persists {@code lastEventCreated} so out-of-order events
 * can be detected and skipped. The legacy plan column on
 * {@code workspaces} stays as a denormalised read-side cache that this
 * service writes through under the same lock — existing reads continue
 * to work unchanged.
 *
 * <p>A {@link Version} field provides defence-in-depth against any code
 * path that ever forgets the pessimistic lock: a stale-write would
 * fail with {@code OptimisticLockingFailureException} instead of
 * silently downgrading a customer's plan.
 */
@Entity
@Table(name = "subscription_states")
public class SubscriptionState {

    @Id
    @GeneratedValue
    private UUID id;

    /** Stripe customer ID (e.g. {@code cus_ABC...}). Natural key for the lock. */
    @Column(name = "stripe_customer_id", nullable = false, unique = true)
    private String stripeCustomerId;

    /** Workspace this customer is bound to. Mirrors workspaces.id; nullable
     * during the brief window before {@code checkout.session.completed} fires. */
    @Column(name = "workspace_id")
    private UUID workspaceId;

    /** Active Stripe subscription ID, if any. */
    @Column(name = "stripe_subscription_id")
    private String stripeSubscriptionId;

    /** Resolved plan: {@code free | pro | business}. Mirrored to workspaces.plan. */
    @Column(nullable = false)
    private String plan = "free";

    /** Last Stripe subscription status applied ({@code active | trialing | past_due | canceled | ...}). */
    @Column(name = "stripe_status")
    private String stripeStatus;

    /** Unix seconds from {@code event.created} of the last applied Stripe event.
     *  Used to discard out-of-order delivery (F-RD4-06). */
    @Column(name = "last_event_created_at", nullable = false)
    private long lastEventCreatedAt;

    /** ID of the last applied Stripe event, for audit/debug. */
    @Column(name = "last_event_id")
    private String lastEventId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    /** Optimistic-lock fallback in case any caller bypasses the row lock. */
    @Version
    private long version;

    public UUID getId() { return id; }

    public String getStripeCustomerId() { return stripeCustomerId; }
    public void setStripeCustomerId(String s) { this.stripeCustomerId = s; }

    public UUID getWorkspaceId() { return workspaceId; }
    public void setWorkspaceId(UUID w) { this.workspaceId = w; }

    public String getStripeSubscriptionId() { return stripeSubscriptionId; }
    public void setStripeSubscriptionId(String s) { this.stripeSubscriptionId = s; }

    public String getPlan() { return plan; }
    public void setPlan(String p) { this.plan = p; }

    public String getStripeStatus() { return stripeStatus; }
    public void setStripeStatus(String s) { this.stripeStatus = s; }

    public long getLastEventCreatedAt() { return lastEventCreatedAt; }
    public void setLastEventCreatedAt(long e) { this.lastEventCreatedAt = e; }

    public String getLastEventId() { return lastEventId; }
    public void setLastEventId(String id) { this.lastEventId = id; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant u) { this.updatedAt = u; }

    public long getVersion() { return version; }
}
