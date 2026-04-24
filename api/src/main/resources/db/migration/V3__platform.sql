-- Users: OAuth-based, no passwords stored
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(128),
    avatar_url      TEXT,
    oauth_provider  VARCHAR(32) NOT NULL, -- github | google
    oauth_subject   VARCHAR(128) NOT NULL,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ,
    UNIQUE (oauth_provider, oauth_subject)
);
CREATE INDEX idx_users_email ON users (email);

-- Workspaces: owned by a user, can have members, one Stripe subscription
CREATE TABLE workspaces (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug                   VARCHAR(64) NOT NULL UNIQUE,
    name                   VARCHAR(128) NOT NULL,
    owner_id               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan                   VARCHAR(32) NOT NULL DEFAULT 'free', -- free | pro | business
    stripe_customer_id     VARCHAR(64) UNIQUE,
    stripe_subscription_id VARCHAR(64),
    trial_ends_at          TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ws_owner ON workspaces (owner_id);
CREATE INDEX idx_ws_stripe_cust ON workspaces (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         VARCHAR(16) NOT NULL CHECK (role IN ('OWNER','ADMIN','MEMBER')),
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_wm_user ON workspace_members (user_id);

-- Link existing api_keys + monitors to workspaces
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Usage counters: rolled up hourly per workspace + endpoint class
CREATE TABLE usage_counters (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    hour_bucket  TIMESTAMPTZ NOT NULL, -- truncated to hour
    endpoint     VARCHAR(64) NOT NULL,
    count        BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, hour_bucket, endpoint)
);
CREATE INDEX idx_usage_ws_time ON usage_counters (workspace_id, hour_bucket DESC);

-- Status pages
CREATE TABLE status_pages (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    slug          VARCHAR(64) NOT NULL UNIQUE,
    name          VARCHAR(128) NOT NULL,
    description   TEXT,
    logo_url      TEXT,
    brand_color   VARCHAR(16),
    public        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sp_ws ON status_pages (workspace_id);

CREATE TABLE status_page_monitors (
    status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
    monitor_id     UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    display_name   VARCHAR(128),
    display_order  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (status_page_id, monitor_id)
);

CREATE TABLE status_page_incidents (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
    title          VARCHAR(255) NOT NULL,
    status         VARCHAR(32) NOT NULL CHECK (status IN ('INVESTIGATING','IDENTIFIED','MONITORING','RESOLVED')),
    impact         VARCHAR(32) NOT NULL CHECK (impact IN ('NONE','MINOR','MAJOR','CRITICAL')),
    body           TEXT,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at    TIMESTAMPTZ
);
CREATE INDEX idx_spi_page_time ON status_page_incidents (status_page_id, started_at DESC);

CREATE TABLE status_page_incident_updates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES status_page_incidents(id) ON DELETE CASCADE,
    status      VARCHAR(32) NOT NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhooks with HMAC signing and durable delivery
CREATE TABLE webhooks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    url           TEXT NOT NULL,
    secret        VARCHAR(128) NOT NULL,
    events        TEXT[] NOT NULL,
    kind          VARCHAR(16) NOT NULL DEFAULT 'generic', -- generic | slack | discord | pagerduty
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ
);
CREATE INDEX idx_wh_ws ON webhooks (workspace_id);

CREATE TABLE webhook_deliveries (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id     UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type     VARCHAR(64) NOT NULL,
    payload        JSONB NOT NULL,
    attempt        INTEGER NOT NULL DEFAULT 0,
    status_code    INTEGER,
    response_body  TEXT,
    next_retry_at  TIMESTAMPTZ,
    succeeded_at   TIMESTAMPTZ,
    dead_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wd_retry ON webhook_deliveries (next_retry_at) WHERE succeeded_at IS NULL AND dead_at IS NULL;
CREATE INDEX idx_wd_webhook ON webhook_deliveries (webhook_id, created_at DESC);

-- Certificate Transparency subscriptions
CREATE TABLE ct_subscriptions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    domain        VARCHAR(253) NOT NULL,
    alert_email   VARCHAR(255),
    last_seen_id  BIGINT, -- crt.sh record id high-water-mark
    last_checked_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, domain)
);
CREATE INDEX idx_cts_ws ON ct_subscriptions (workspace_id);

CREATE TABLE ct_observations (
    id              BIGSERIAL PRIMARY KEY,
    subscription_id UUID NOT NULL REFERENCES ct_subscriptions(id) ON DELETE CASCADE,
    crtsh_id        BIGINT NOT NULL,
    issuer          TEXT,
    subject         TEXT,
    sans            TEXT[],
    not_before      TIMESTAMPTZ,
    not_after       TIMESTAMPTZ,
    observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, crtsh_id)
);
CREATE INDEX idx_cto_sub_time ON ct_observations (subscription_id, observed_at DESC);

-- Seed a "default" workspace that existing monitors can be assigned to on migration.
-- In a real rollout you'd do this through a one-off job that maps per tenant.
INSERT INTO users (id, email, name, oauth_provider, oauth_subject, email_verified)
VALUES ('00000000-0000-0000-0000-000000000001', 'system@netscope.io', 'System', 'system', 'system', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO workspaces (id, slug, name, owner_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (slug) DO NOTHING;
