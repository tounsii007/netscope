-- F-RD4-06 — Race-safe Stripe webhook handling.
--
-- The original webhook handler took a workspaces row, computed a new
-- plan, and wrote it back without serialisation. Two webhook events
-- for the same customer (concurrent delivery, or an old retried event
-- racing a fresh one) could overwrite each other, producing silent
-- plan downgrades. This migration adds:
--
--   1. subscription_states — the per-Stripe-customer row the webhook
--      handler takes SELECT ... FOR UPDATE on. The workspaces.plan
--      column is kept as a denormalised read cache the handler writes
--      through under the same row lock.
--
--   2. stripe_event_log — the idempotency key. Stripe delivers events
--      at-least-once, and a unique constraint on event_id makes a
--      second apply attempt fail loudly instead of writing twice.

CREATE TABLE subscription_states (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Natural key for the row lock. UNIQUE so SELECT ... FOR UPDATE
    -- by customer id is index-backed and serialises predictably.
    stripe_customer_id       VARCHAR(64) NOT NULL UNIQUE,
    workspace_id             UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    stripe_subscription_id   VARCHAR(64),
    plan                     VARCHAR(32) NOT NULL DEFAULT 'free',
    stripe_status            VARCHAR(32),
    -- Unix seconds from event.created. The handler refuses to apply
    -- any event whose created < last_event_created_at — that's the
    -- F-RD4-06 out-of-order guard.
    last_event_created_at    BIGINT NOT NULL DEFAULT 0,
    last_event_id            VARCHAR(64),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- @Version column for Hibernate optimistic-lock fallback if any
    -- code path ever bypasses the pessimistic row lock.
    version                  BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_subscription_states_workspace
    ON subscription_states (workspace_id)
    WHERE workspace_id IS NOT NULL;

-- Backfill subscription_states from existing workspaces with a Stripe
-- customer so a pre-existing customer's next webhook event finds a
-- row to lock instead of inserting a fresh one (which would skip the
-- out-of-order guard on the very first event after deployment).
INSERT INTO subscription_states (
    stripe_customer_id, workspace_id, stripe_subscription_id, plan, last_event_created_at
)
SELECT
    w.stripe_customer_id,
    w.id,
    w.stripe_subscription_id,
    w.plan,
    0
FROM workspaces w
WHERE w.stripe_customer_id IS NOT NULL
ON CONFLICT (stripe_customer_id) DO NOTHING;

CREATE TABLE stripe_event_log (
    -- Stripe event IDs are evt_* strings; 64 chars covers every value
    -- observed in production with room for the next Stripe-side bump.
    event_id     VARCHAR(64) PRIMARY KEY,
    event_type   VARCHAR(64),
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Lookups for replay-check are PK probes already; this index is for
-- the periodic "purge events older than N days" maintenance job.
CREATE INDEX idx_stripe_event_log_applied
    ON stripe_event_log (applied_at);
