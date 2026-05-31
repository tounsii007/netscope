package io.netscope.billing;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/**
 * F-RD4-06 — Repository for the per-Stripe-customer plan-state row.
 *
 * <p>{@link #findByCustomerIdForUpdate(String)} acquires
 * {@code SELECT ... FOR UPDATE} on the matching row. The caller MUST be
 * inside a {@code @Transactional} method or the lock is released
 * immediately (Hibernate flushes-and-commits per-statement otherwise),
 * which would re-open the race we're closing.
 *
 * <p>We do NOT use {@code SKIP LOCKED} here: two webhooks for the same
 * customer must be serialised, not parallelised. The second one should
 * block on the lock until the first one commits, then read the fresh
 * row and proceed (or skip on out-of-order check).
 */
public interface SubscriptionStateRepository extends JpaRepository<SubscriptionState, UUID> {

    /**
     * Pessimistic row lock by Stripe customer ID. F-RD4-06.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SubscriptionState s WHERE s.stripeCustomerId = :customerId")
    Optional<SubscriptionState> findByCustomerIdForUpdate(@Param("customerId") String customerId);

    /** Non-locking lookup, e.g. for read-only dashboards. */
    Optional<SubscriptionState> findByStripeCustomerId(String stripeCustomerId);
}
