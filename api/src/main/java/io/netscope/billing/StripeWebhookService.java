package io.netscope.billing;

import com.stripe.model.Event;
import com.stripe.model.StripeObject;
import com.stripe.model.Subscription;
import com.stripe.model.checkout.Session;
import io.netscope.workspace.Workspace;
import io.netscope.workspace.WorkspaceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * F-RD4-06 — Race-safe Stripe webhook dispatcher.
 *
 * <p>Stripe webhook deliveries are not ordered or once-only:
 *
 * <ul>
 *   <li><b>Concurrent delivery.</b> Two events for the same customer can
 *       hit two Tomcat threads at the same time. Without serialisation,
 *       both threads read the workspace row, compute a plan, and the
 *       slower writer wins — even when its event is older.</li>
 *   <li><b>Out-of-order delivery.</b> Stripe occasionally batches +
 *       reorders events, and retries failed events for up to 3 days.
 *       An old retried {@code customer.subscription.deleted} arriving
 *       after a fresh {@code .updated} would silently downgrade the
 *       account.</li>
 *   <li><b>At-least-once delivery.</b> Stripe re-sends events that
 *       didn't 2xx within ~30s, or when our pod crashes mid-handler.
 *       Re-applying a plan change should be a no-op, but writing
 *       {@code stripe_subscription_id} twice is fine — writing
 *       {@code plan} twice after a customer mutated state via the
 *       portal in between is not.</li>
 * </ul>
 *
 * <p>This service applies a three-layer defence around every event:
 *
 * <ol>
 *   <li><b>Idempotency.</b> {@link StripeEventLog} is keyed on
 *       {@code event.id}. A pre-check short-circuits replays before
 *       we touch any other row; the unique constraint on the PK is the
 *       final word if two replicas race past the pre-check.</li>
 *   <li><b>Pessimistic row lock.</b>
 *       {@link SubscriptionStateRepository#findByCustomerIdForUpdate}
 *       takes {@code SELECT ... FOR UPDATE} on the per-customer row.
 *       Two concurrent events for the same customer serialise; events
 *       for different customers stay parallel.</li>
 *   <li><b>Timestamp ordering.</b> {@code event.created} (Stripe's
 *       server-side timestamp, monotonically increasing per Stripe's
 *       documentation) is compared against the last value we applied;
 *       older events are dropped.</li>
 * </ol>
 *
 * <p>The transaction is {@link Isolation#REPEATABLE_READ} so the row
 * we lock + read + compare-against stays stable for the duration of
 * the handler, even if another transaction commits a {@code workspaces}
 * row update via a different code path in between our reads.
 */
@Service
public class StripeWebhookService {

    private static final Logger log = LoggerFactory.getLogger(StripeWebhookService.class);

    private final SubscriptionStateRepository states;
    private final StripeEventLogRepository eventLog;
    private final WorkspaceRepository workspaces;

    public StripeWebhookService(SubscriptionStateRepository states,
                                StripeEventLogRepository eventLog,
                                WorkspaceRepository workspaces) {
        this.states = states;
        this.eventLog = eventLog;
        this.workspaces = workspaces;
    }

    /**
     * F-RD4-06 — Apply a Stripe event under row lock + idempotency log.
     * Returns {@code true} if the event was applied (or already applied
     * — caller can return 200 either way), {@code false} only on
     * unrecoverable issues that should propagate as 4xx/5xx.
     */
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public boolean apply(Event event) {
        if (event == null || event.getId() == null) return false;

        // F-RD4-06 (idempotency): cheap PK lookup short-circuits Stripe's
        // at-least-once retries. The same event delivered twice within
        // milliseconds will: (a) hit this branch on the second delivery
        // after the first commit, or (b) lose the race and hit the unique
        // constraint catch below — either way, the apply runs exactly once.
        if (eventLog.existsById(event.getId())) {
            log.info("Stripe event {} ({}) already applied — skipping",
                event.getId(), event.getType());
            return true;
        }

        StripeObject obj = event.getDataObjectDeserializer().getObject().orElse(null);
        if (obj == null) {
            log.warn("Stripe event {} ({}) carries no deserialisable object — skipping",
                event.getId(), event.getType());
            return true;
        }

        try {
            switch (event.getType()) {
                case "checkout.session.completed" -> {
                    if (obj instanceof Session s) applyCheckoutComplete(event, s);
                }
                case "customer.subscription.created",
                     "customer.subscription.updated",
                     "customer.subscription.deleted" -> {
                    if (obj instanceof Subscription sub) applySubscriptionChange(event, sub);
                }
                default -> log.debug("Ignoring Stripe event type {}", event.getType());
            }
            recordApplied(event);
            return true;
        } catch (DataIntegrityViolationException dup) {
            // F-RD4-06: lost the race against a concurrent replica that
            // also processed this event-id. Their commit succeeded; ours
            // is rolled back. Return 200 — the work is done.
            log.info("Stripe event {} applied concurrently by another replica — treating as success",
                event.getId());
            return true;
        }
    }

    /**
     * F-RD4-06 — checkout.session.completed binds a Stripe customer ID
     * to a workspace for the first time, so the {@code subscription_states}
     * row may not exist yet. Upsert under lock either way.
     */
    private void applyCheckoutComplete(Event event, Session session) {
        String customerId = session.getCustomer();
        String workspaceIdRaw = session.getClientReferenceId();
        if (customerId == null || workspaceIdRaw == null) {
            log.warn("checkout.session.completed event {} missing customer or client_reference_id",
                event.getId());
            return;
        }

        UUID workspaceId;
        try {
            workspaceId = UUID.fromString(workspaceIdRaw);
        } catch (IllegalArgumentException bad) {
            log.warn("checkout.session.completed event {} has non-UUID client_reference_id: {}",
                event.getId(), workspaceIdRaw);
            return;
        }

        SubscriptionState state = loadOrInit(customerId);
        if (!shouldApply(state, event)) return;

        state.setWorkspaceId(workspaceId);
        state.setStripeSubscriptionId(session.getSubscription());
        stampEvent(state, event);
        states.save(state);

        // Mirror to the workspaces table under the same transaction so
        // existing read paths (WorkspaceController, BillingController.portal)
        // continue to see consistent state.
        workspaces.findById(workspaceId).ifPresent(w -> {
            w.setStripeCustomerId(customerId);
            if (session.getSubscription() != null) {
                w.setStripeSubscriptionId(session.getSubscription());
            }
            workspaces.save(w);
        });
    }

    /**
     * F-RD4-06 — customer.subscription.{created,updated,deleted} is the
     * race-prone path the original ticket called out: read–compute–write
     * on the workspace row with no serialisation.
     */
    private void applySubscriptionChange(Event event, Subscription sub) {
        String customerId = sub.getCustomer();
        if (customerId == null) {
            log.warn("subscription event {} has no customer id", event.getId());
            return;
        }

        SubscriptionState state = loadOrInit(customerId);
        if (!shouldApply(state, event)) return;

        String plan = mapPlan(sub);
        state.setPlan(plan);
        state.setStripeSubscriptionId(sub.getId());
        state.setStripeStatus(sub.getStatus());
        stampEvent(state, event);
        states.save(state);

        // Mirror to the workspaces table under the same row lock by going
        // through findByStripeCustomerId. If the workspace row hasn't been
        // bound yet (out-of-order: subscription event arrived before
        // checkout.session.completed), the state row above still carries
        // the truth, and the checkout handler will reconcile on arrival.
        Optional<Workspace> ws = workspaces.findByStripeCustomerId(customerId);
        ws.ifPresent(w -> {
            w.setPlan(plan);
            w.setStripeSubscriptionId(sub.getId());
            workspaces.save(w);
            log.info("Workspace {} plan updated to {} (stripe event {})",
                w.getSlug(), plan, event.getId());
        });
    }

    /**
     * F-RD4-06 — fetch the locked row, or build a fresh one if this is
     * the first event we've seen for this customer. The {@code FOR UPDATE}
     * clause holds for the rest of the transaction.
     */
    private SubscriptionState loadOrInit(String customerId) {
        return states.findByCustomerIdForUpdate(customerId).orElseGet(() -> {
            SubscriptionState fresh = new SubscriptionState();
            fresh.setStripeCustomerId(customerId);
            fresh.setLastEventCreatedAt(0L);
            return fresh;
        });
    }

    /**
     * F-RD4-06 — out-of-order guard. If the incoming event was created
     * before the last one we applied, drop it. Equal timestamps are
     * allowed through because a tied {@code event.created} between
     * created+updated pairs is plausible and the idempotency log
     * still protects us from a duplicate apply.
     */
    private boolean shouldApply(SubscriptionState state, Event event) {
        long incoming = event.getCreated() == null ? 0L : event.getCreated();
        long last = state.getLastEventCreatedAt();
        if (incoming < last) {
            log.warn("Skipping out-of-order Stripe event {} ({}): created={}, last applied={}",
                event.getId(), event.getType(), incoming, last);
            return false;
        }
        return true;
    }

    private void stampEvent(SubscriptionState state, Event event) {
        long incoming = event.getCreated() == null ? Instant.now().getEpochSecond() : event.getCreated();
        state.setLastEventCreatedAt(incoming);
        state.setLastEventId(event.getId());
        state.setUpdatedAt(Instant.now());
    }

    /** F-RD4-06 — persists the idempotency-log row inside the same transaction. */
    private void recordApplied(Event event) {
        eventLog.save(new StripeEventLog(event.getId(), event.getType()));
    }

    /**
     * Maps a Stripe Subscription to a plan string. Identical to the
     * previous in-controller logic — kept here so the controller can
     * stay thin.
     */
    private String mapPlan(Subscription sub) {
        if (!"active".equals(sub.getStatus()) && !"trialing".equals(sub.getStatus())) return "free";
        var items = sub.getItems();
        if (items == null || items.getData().isEmpty()) return "free";
        String priceId = items.getData().get(0).getPrice().getId();
        return switch (priceId) {
            case "price_pro"      -> "pro";
            case "price_business" -> "business";
            default -> priceMatches(priceId, List.of("pro")) ? "pro"
                : priceMatches(priceId, List.of("business", "biz")) ? "business" : "free";
        };
    }

    private boolean priceMatches(String id, List<String> keywords) {
        String lower = id.toLowerCase();
        return keywords.stream().anyMatch(lower::contains);
    }
}
