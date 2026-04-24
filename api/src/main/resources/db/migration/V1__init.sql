CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE scans (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool         VARCHAR(32) NOT NULL,
    target       VARCHAR(255) NOT NULL,
    client_ip    INET,
    api_key_id   UUID,
    result       JSONB NOT NULL,
    duration_ms  INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_scans_tool_created ON scans (tool, created_at DESC);
CREATE INDEX idx_scans_target ON scans (target);

CREATE TABLE api_keys (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash     VARCHAR(128) NOT NULL UNIQUE,
    name         VARCHAR(128),
    plan         VARCHAR(32) NOT NULL DEFAULT 'free',
    rate_limit   INTEGER NOT NULL DEFAULT 600,
    owner_email  VARCHAR(255),
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE TABLE monitors (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id   UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    name         VARCHAR(128) NOT NULL,
    type         VARCHAR(16) NOT NULL, -- http, tcp, ping
    target       VARCHAR(255) NOT NULL,
    port         INTEGER,
    interval_sec INTEGER NOT NULL DEFAULT 300,
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    alert_email  VARCHAR(255),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_monitors_enabled ON monitors (enabled) WHERE enabled;

CREATE TABLE monitor_checks (
    id           BIGSERIAL PRIMARY KEY,
    monitor_id   UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    up           BOOLEAN NOT NULL,
    latency_ms   INTEGER,
    status_code  INTEGER,
    error        TEXT,
    checked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_checks_monitor_time ON monitor_checks (monitor_id, checked_at DESC);

CREATE TABLE ip_cache (
    ip           INET PRIMARY KEY,
    data         JSONB NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL
);
