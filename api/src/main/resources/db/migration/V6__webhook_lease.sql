-- F-RD5-05 — Worker-lease columns for race-safe webhook dispatch.
--
-- The original WebhookDeliveryWorker held SELECT ... FOR UPDATE SKIP LOCKED
-- only for the duration of the @Transactional tick() method, which committed
-- as soon as the rows were SUBMITTED to the virtual-thread pool — long before
-- send() actually finished. The row locks were released while the HTTP POST
-- was still in flight, so a second pod's next tick could pick up the same row
-- and POST it again, producing duplicate webhook deliveries to the customer.
--
-- The fix replaces the row-lock-spanning-the-dispatch design with a lease
-- model:
--
--   1. acquireBatch() opens a short REQUIRES_NEW tx, runs
--          SELECT ... FOR UPDATE SKIP LOCKED LIMIT N
--      to atomically claim N free rows, stamps each with
--          worker_id   = <this pod's ULID>
--          leased_until = now() + lease-ttl
--      and commits. The pessimistic row lock is released, but no other pod
--      will pick the row up until leased_until passes (see pickup predicate
--      in WebhookDeliveryRepository.pending()).
--
--   2. send() runs WITHOUT any DB lock.
--
--   3. On result, finalise() opens a second REQUIRES_NEW tx and does a guarded
--      UPDATE: only this worker_id can transition the row. A stale lease (we
--      crashed and another pod picked the row up after the TTL) will silently
--      lose the race — the other pod's success/retry stays committed.
--
-- The TTL must be > the worst-case send() wall-clock (HTTP connect-timeout
-- 5 s + read-timeout 10 s + retry/backpressure padding). 90 s is the chosen
-- value in the worker.

ALTER TABLE webhook_deliveries ADD COLUMN worker_id varchar(64);
ALTER TABLE webhook_deliveries ADD COLUMN leased_until timestamptz;

-- Index used by the pickup query:
--   WHERE succeeded_at IS NULL AND dead_at IS NULL
--     AND next_retry_at <= now()
--     AND (leased_until IS NULL OR leased_until < now())
--
-- We index on (leased_until, next_retry_at) under the partial predicate that
-- already gates the dispatch loop, so pickup stays an index-only scan even at
-- millions of historical rows. Existing idx_wd_retry covers retries; this one
-- targets the lease-availability check specifically.
CREATE INDEX idx_webhook_lease_pickup
    ON webhook_deliveries (leased_until, next_retry_at)
    WHERE succeeded_at IS NULL AND dead_at IS NULL;
