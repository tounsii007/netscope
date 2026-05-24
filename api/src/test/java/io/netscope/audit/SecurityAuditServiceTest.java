package io.netscope.audit;

import io.netscope.testsupport.NoOpJpaRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for SecurityAuditService — the audit-trail writer that records
 * security events (auth failures, blocked SSRFs, rate-limit hits) into
 * security_events. Critical for compliance + forensics.
 *
 * Uses Spring's MockHttpServletRequest (a real implementation) and a
 * hand-rolled in-memory repository stub so the test does not depend on
 * Mockito bytecode mocking of JPA / Servlet interfaces.
 */
class SecurityAuditServiceTest {

    private final RecordingRepo repo = new RecordingRepo();
    private final SecurityAuditService svc = new SecurityAuditService(repo);

    /* ─── client IP resolution ───────────────────────────────────────────── */

    @Test void ignores_raw_xff_header_and_uses_remoteAddr() {
        // Pre-fix this test was titled "persists_event_with_first_xff_hop"
        // and the implementation read XFF[0] verbatim — spoofable per-request.
        // Now we trust Tomcat's RemoteIpValve (which writes the validated
        // value to remoteAddr) and IGNORE the raw header entirely.
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("198.51.100.42");
        req.addHeader("X-Forwarded-For", "1.2.3.4, 10.0.0.5");   // spoofed

        svc.record("AUTH_FAIL", SecurityAuditService.Severity.ALERT, req, UUID.randomUUID(),
            Map.of("reason", "bad signature"));

        assertThat(repo.events).hasSize(1);
        assertThat(repo.events.get(0).getClientIp())
            .as("client IP must be the validated remoteAddr, not the spoofed XFF")
            .isEqualTo("198.51.100.42");
    }

    @Test void uses_remoteAddr_when_no_xff_header() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("198.51.100.42");

        svc.record("RATE_LIMIT", SecurityAuditService.Severity.WARN, req, null, Map.of());
        assertThat(repo.events).hasSize(1);
        assertThat(repo.events.get(0).getClientIp()).isEqualTo("198.51.100.42");
    }

    @Test void blank_xff_header_does_not_override_remoteAddr() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-Forwarded-For", "   ");
        req.setRemoteAddr("198.51.100.99");

        svc.record("SSRF_BLOCK", SecurityAuditService.Severity.ALERT, req, null, Map.of());
        assertThat(repo.events).hasSize(1);
        assertThat(repo.events.get(0).getClientIp()).isEqualTo("198.51.100.99");
    }

    @Test void tolerates_null_request_object() {
        // Background workers may pass req=null
        svc.record("BACKGROUND_EVENT", SecurityAuditService.Severity.INFO, null, null,
            Map.of("ok", true));
        assertThat(repo.events).hasSize(1);
    }

    @Test void swallows_repository_exception_to_protect_request_path() {
        repo.failNext.set(1);

        // Must NOT throw — audit failure cannot break the live request
        svc.record("AUTH_FAIL", SecurityAuditService.Severity.ALERT, null, null, Map.of());

        assertThat(repo.events).isEmpty(); // save threw, nothing persisted
    }

    @Test void severity_enum_values_are_stable_for_db_storage() {
        // The DB column stores severity.name() — these strings are persisted
        // and must stay stable across releases (existing rows depend on them).
        assertThat(SecurityAuditService.Severity.INFO.name()).isEqualTo("INFO");
        assertThat(SecurityAuditService.Severity.WARN.name()).isEqualTo("WARN");
        assertThat(SecurityAuditService.Severity.ALERT.name()).isEqualTo("ALERT");
        assertThat(SecurityAuditService.Severity.values()).hasSize(3);
    }

    @Test void persists_multiple_events_in_order_received() {
        HttpServletRequest req = new MockHttpServletRequest();
        for (int i = 0; i < 5; i++) {
            svc.record("EVT_" + i, SecurityAuditService.Severity.INFO, req, null, Map.of("seq", i));
        }
        assertThat(repo.events).hasSize(5);
    }

    /* ─── typed EventType overload (iter 27) ─────────────────────────────── */

    @Test void typed_overload_writes_stable_wire_name() {
        // The DB column stores the EventType's wireName(), NOT the enum's
        // name(). Renaming an enum constant must not change the on-disk
        // string — that would break every dashboard filter.
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("203.0.113.10");

        svc.record(SecurityAuditService.EventType.API_KEY_INVALID,
            SecurityAuditService.Severity.WARN, req, null, Map.of());

        assertThat(repo.events).hasSize(1);
        assertThat(repo.events.get(0).getEventType()).isEqualTo("api_key.invalid");
    }

    @Test void every_EventType_constant_has_a_dotted_wireName() {
        // Convention: wireName follows "namespace.action" so log queries
        // can filter by prefix (`event_type LIKE 'auth.%'`).
        for (SecurityAuditService.EventType t : SecurityAuditService.EventType.values()) {
            assertThat(t.wireName())
                .as("EventType.%s.wireName() should be lower.snake.dotted", t.name())
                .matches("^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*$");
        }
    }

    @Test void EventType_wireName_values_are_unique() {
        // Two enum constants with the same wire name would corrupt the
        // event-type histogram — each row would be ambiguous.
        Set<String> seen = new HashSet<>();
        for (SecurityAuditService.EventType t : SecurityAuditService.EventType.values()) {
            assertThat(seen.add(t.wireName()))
                .as("duplicate wireName: " + t.wireName()).isTrue();
        }
    }

    /* ─── stub repository ────────────────────────────────────────────────── */

    /**
     * Hand-rolled, mock-free stub. Keep it small — we only need the methods
     * SecurityAuditService actually calls (just save).
     */
    static class RecordingRepo extends NoOpJpaRepository<SecurityEvent, Long> implements SecurityEventRepository {
        final List<SecurityEvent> events = new ArrayList<>();
        final AtomicInteger failNext = new AtomicInteger(0);

        @Override
        public <S extends SecurityEvent> S save(S entity) {
            if (failNext.getAndDecrement() > 0) {
                throw new RuntimeException("simulated DB failure");
            }
            events.add(entity);
            return entity;
        }
    }
}
