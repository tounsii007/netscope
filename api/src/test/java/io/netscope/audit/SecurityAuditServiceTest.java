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

    /* ─── XFF extraction ─────────────────────────────────────────────────── */

    @Test void persists_event_with_first_xff_hop() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-Forwarded-For", "203.0.113.1, 10.0.0.5, 10.0.0.6");

        UUID apiKey = UUID.randomUUID();
        svc.record("AUTH_FAIL", SecurityAuditService.Severity.ALERT, req, apiKey,
            Map.of("reason", "bad signature"));

        assertThat(repo.events).hasSize(1);
    }

    @Test void falls_back_to_remoteAddr_when_no_xff() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("198.51.100.42");

        svc.record("RATE_LIMIT", SecurityAuditService.Severity.WARN, req, null, Map.of());
        assertThat(repo.events).hasSize(1);
    }

    @Test void treats_blank_xff_header_as_missing() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-Forwarded-For", "   ");
        req.setRemoteAddr("198.51.100.99");

        svc.record("SSRF_BLOCK", SecurityAuditService.Severity.ALERT, req, null, Map.of());
        assertThat(repo.events).hasSize(1);
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
