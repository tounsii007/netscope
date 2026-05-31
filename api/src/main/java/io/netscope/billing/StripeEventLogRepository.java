package io.netscope.billing;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * F-RD4-06 — Idempotency-key lookup for Stripe webhook events.
 *
 * <p>{@code existsById} maps to a single PK probe and is cheaper than
 * pulling the whole row. Used to short-circuit replays before we take
 * the heavier {@code SubscriptionState} row lock.
 */
public interface StripeEventLogRepository extends JpaRepository<StripeEventLog, String> {
}
