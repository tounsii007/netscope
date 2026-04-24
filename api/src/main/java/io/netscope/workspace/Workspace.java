package io.netscope.workspace;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "workspaces")
public class Workspace {
    @Id @GeneratedValue private UUID id;
    @Column(nullable = false, unique = true) private String slug;
    @Column(nullable = false) private String name;
    @Column(name = "owner_id", nullable = false) private UUID ownerId;
    @Column(nullable = false) private String plan = "free";
    @Column(name = "stripe_customer_id", unique = true) private String stripeCustomerId;
    @Column(name = "stripe_subscription_id") private String stripeSubscriptionId;
    @Column(name = "trial_ends_at") private Instant trialEndsAt;
    @Column(name = "created_at") private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public String getSlug() { return slug; } public void setSlug(String s) { this.slug = s; }
    public String getName() { return name; } public void setName(String n) { this.name = n; }
    public UUID getOwnerId() { return ownerId; } public void setOwnerId(UUID o) { this.ownerId = o; }
    public String getPlan() { return plan; } public void setPlan(String p) { this.plan = p; }
    public String getStripeCustomerId() { return stripeCustomerId; }
    public void setStripeCustomerId(String s) { this.stripeCustomerId = s; }
    public String getStripeSubscriptionId() { return stripeSubscriptionId; }
    public void setStripeSubscriptionId(String s) { this.stripeSubscriptionId = s; }
}
