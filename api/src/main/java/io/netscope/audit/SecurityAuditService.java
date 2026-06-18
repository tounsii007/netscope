package io.netscope.audit;

import io.netscope.common.security.ClientIpResolver;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

/**
 * Writes structured security-audit events to the {@code security_events}
 * table for forensic review.
 *
 * <h3>Stable {@link EventType} contract</h3>
 *
 * Originally callsites passed a free-text {@code String type} like
 * {@code "api_key.invalid"} or {@code "auth.unauthorized"}. Two problems
 * with that:
 *
 *   1. A typo at the callsite ({@code "api_key.invlaid"}) silently
 *      writes a brand-new event-type that doesn't match the dashboard
 *      filter. The bad row sits in the table forever.
 *   2. Reworded copy ("api_key.invalid" → "auth.api_key.invalid") would
 *      break every existing Grafana / Datadog alert that filtered on
 *      the old name.
 *
 * The {@link EventType} enum makes the type set explicit. Callsites
 * still convert to String at write-time (the DB column is VARCHAR so
 * the on-disk format is stable) but type-checking guarantees a
 * misspelt enum constant is a compile-time error, and renames can be
 * audited via {@code @Deprecated} before a column rename migration.
 *
 * The legacy {@link #record(String, Severity, HttpServletRequest, UUID, Map)}
 * overload is kept for backward compatibility with any third-party
 * integration that wires in custom types; new code should use the
 * enum-typed overload.
 */
@Service
public class SecurityAuditService {

    public enum Severity { INFO, WARN, ALERT }

    /**
     * Stable, machine-readable inventory of every security event the
     * platform can emit. Add new entries here when you introduce a new
     * audit point; never silently rename an existing one — query
     * dashboards depend on the on-disk string.
     */
    public enum EventType {
        /** API key header was present but did not match any active key. */
        API_KEY_INVALID("api_key.invalid"),
        /** No API key on a request that required authentication. */
        AUTH_UNAUTHORIZED("auth.unauthorized"),
        /** Rate-limit bucket exceeded for either anon or auth tier. */
        RATE_LIMITED("rate_limit.exceeded"),
        /**
         * TargetValidator rejected the request (loopback / private /
         * cloud metadata target). Emitted from any tool that calls
         * the validator before reaching out.
         */
        TARGET_BLOCKED("target.blocked"),
        /** TargetValidator allowed the request but it failed to resolve. */
        TARGET_UNRESOLVABLE("target.unresolvable"),
        /** Generic catch-all when no enum fits — log a follow-up to add one. */
        OTHER("other");

        private final String wireName;
        EventType(String wireName) { this.wireName = wireName; }
        /** The string written to the {@code event_type} column. STABLE. */
        public String wireName() { return wireName; }
    }

    private final SecurityEventRepository repo;
    public SecurityAuditService(SecurityEventRepository repo) { this.repo = repo; }

    /** Preferred — typed overload. Use whenever the event maps cleanly to an EventType constant. */
    @Async
    public void record(EventType type, Severity sev, HttpServletRequest req, UUID apiKey, Map<String, Object> details) {
        record(type.wireName(), sev, req, apiKey, details);
    }

    /**
     * Legacy overload. Kept for two reasons:
     *   • backward compat with any callsite that depended on the
     *     pre-enum API (e.g. ApiKeyFilter while we migrate it
     *     incrementally)
     *   • escape hatch for genuinely ad-hoc events that don't warrant
     *     a permanent enum constant (test fixtures, manual hooks)
     */
    @Async
    public void record(String type, Severity sev, HttpServletRequest req, UUID apiKey, Map<String, Object> details) {
        try {
            repo.save(new SecurityEvent(type, sev.name(), ClientIpResolver.clientIp(req), apiKey, details));
        } catch (Exception ignored) { /* never break the request */ }
    }
}

@Repository
interface SecurityEventRepository extends JpaRepository<SecurityEvent, Long> {}
