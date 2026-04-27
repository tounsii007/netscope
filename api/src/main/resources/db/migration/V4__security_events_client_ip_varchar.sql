-- Fix: Hibernate sends client_ip as VARCHAR but the column was INET, causing
-- "column \"client_ip\" is of type inet but expression is of type character varying".
-- We don't actually need INET semantics in the audit table — we never query by
-- subnet, only by exact equality. VARCHAR(45) is large enough for IPv6 with
-- zone IDs, and avoids the type-mismatch on every insert.

ALTER TABLE security_events
    ALTER COLUMN client_ip TYPE VARCHAR(45) USING client_ip::TEXT;
