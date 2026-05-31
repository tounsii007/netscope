package io.netscope.webhook;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface WebhookDeliveryRepository extends JpaRepository<WebhookDelivery, UUID> {

    /**
     * Pull the next batch of dispatchable deliveries — rows that are pending
     * (not yet succeeded, not yet dead, due for delivery) AND not currently
     * leased to another worker.
     *
     * <p>Race-safe in a horizontally-scaled deployment: multiple pod replicas
     * call this on the same fixed-delay schedule. Without the row lock + lease,
     * pod-A and pod-B would both pick up the same rows and POST them
     * concurrently, producing duplicate deliveries to customer endpoints.
     *
     * <ul>
     *   <li>{@code @Lock(PESSIMISTIC_WRITE)} acquires SELECT ... FOR UPDATE.
     *   <li>{@code jakarta.persistence.lock.timeout = -2} maps to PostgreSQL
     *       SKIP LOCKED, so a second pod immediately gets the NEXT batch
     *       instead of blocking until the first pod commits.
     *   <li>The {@code (leased_until IS NULL OR leased_until < :now)}
     *       predicate is the F-RD5-05 fix: once a worker stamps a row with
     *       its leasedUntil, the row is invisible to other workers' pickup
     *       queries even AFTER the row lock is released — which it must be,
     *       because the worker holds the row across an HTTP POST that can
     *       take seconds, far longer than any database tx should run.
     * </ul>
     *
     * <p>Caller MUST be inside a {@code REQUIRES_NEW} tx that immediately
     * stamps the returned rows with a worker_id + leased_until and commits.
     * The pessimistic row lock is released on that commit; the lease takes
     * over as the exclusion mechanism.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints({ @QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2") })
    @Query("""
        SELECT d FROM WebhookDelivery d
        WHERE d.succeededAt IS NULL AND d.deadAt IS NULL AND d.nextRetryAt <= :now
          AND (d.leasedUntil IS NULL OR d.leasedUntil < :now)
        ORDER BY d.nextRetryAt ASC
        """)
    List<WebhookDelivery> pending(Instant now, Pageable limit);

    /**
     * F-RD5-05 — Guarded finalisation. Only updates the row if it is still
     * leased to THIS worker — i.e. our send() finished before the lease
     * expired and was reclaimed. A non-zero return means we still own the
     * transition; zero means a stale lease lost the race to another pod and
     * our HTTP response must be discarded.
     *
     * <p>Marks the row succeeded (sets succeeded_at) AND clears the lease in
     * one atomic UPDATE.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        UPDATE WebhookDelivery d
           SET d.succeededAt = :now,
               d.statusCode = :statusCode,
               d.responseBody = :responseBody,
               d.workerId = NULL,
               d.leasedUntil = NULL
         WHERE d.id = :id
           AND d.workerId = :workerId
           AND d.succeededAt IS NULL
           AND d.deadAt IS NULL
        """)
    int finaliseSucceeded(UUID id, String workerId, Instant now,
                          Integer statusCode, String responseBody);

    /**
     * F-RD5-05 — Guarded retry-schedule. Same lease check as
     * {@link #finaliseSucceeded}. Bumps the attempt counter, writes the
     * failure reason into response_body, schedules the next retry, and
     * releases the lease so the next tick (after nextRetryAt elapses) picks
     * the row up again.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        UPDATE WebhookDelivery d
           SET d.attempt = :attempt,
               d.statusCode = :statusCode,
               d.responseBody = :responseBody,
               d.nextRetryAt = :nextRetryAt,
               d.workerId = NULL,
               d.leasedUntil = NULL
         WHERE d.id = :id
           AND d.workerId = :workerId
           AND d.succeededAt IS NULL
           AND d.deadAt IS NULL
        """)
    int finaliseRetry(UUID id, String workerId, int attempt,
                      Integer statusCode, String responseBody, Instant nextRetryAt);

    /**
     * F-RD5-05 — Guarded dead-letter transition. Used when the attempt cap
     * is hit OR when delivery-time SSRF validation fails. Same lease check.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
        UPDATE WebhookDelivery d
           SET d.deadAt = :now,
               d.attempt = :attempt,
               d.statusCode = :statusCode,
               d.responseBody = :responseBody,
               d.workerId = NULL,
               d.leasedUntil = NULL
         WHERE d.id = :id
           AND d.workerId = :workerId
           AND d.succeededAt IS NULL
           AND d.deadAt IS NULL
        """)
    int finaliseDead(UUID id, String workerId, Instant now, int attempt,
                     Integer statusCode, String responseBody);

    List<WebhookDelivery> findByWebhookIdOrderByCreatedAtDesc(UUID webhookId, Pageable limit);
}
