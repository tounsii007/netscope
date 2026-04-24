CREATE TABLE security_events (
    id           BIGSERIAL PRIMARY KEY,
    event_type   VARCHAR(48) NOT NULL,
    severity     VARCHAR(16) NOT NULL,
    client_ip    INET,
    api_key_id   UUID,
    details      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sec_type_time ON security_events (event_type, created_at DESC);
CREATE INDEX idx_sec_ip_time   ON security_events (client_ip, created_at DESC)
    WHERE client_ip IS NOT NULL;

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rotated_from UUID REFERENCES api_keys(id);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
