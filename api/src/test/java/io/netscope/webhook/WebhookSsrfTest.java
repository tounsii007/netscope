package io.netscope.webhook;

import io.netscope.common.ApiException;
import io.netscope.common.TargetValidator;
import io.netscope.testsupport.NoOpJpaRepository;
import io.netscope.workspace.WorkspaceMember;
import io.netscope.workspace.WorkspaceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

/**
 * Adversarial SSRF tests for {@link WebhookController#validateWebhookUrl(String)}
 * and {@link WebhookDeliveryWorker#isSsrfSafeUrl(String)}.
 *
 * Before the fix, the URL-validation regex was:
 *   url.startsWith("https://") || url.startsWith("http://localhost")
 * which is trivially bypassable:
 *   • https://169.254.169.254/...   (AWS IMDS — Capital One CVE class)
 *   • https://10.0.0.1/...          (RFC 1918)
 *   • https://[::1]/...             (IPv6 loopback)
 *   • https://localhost.evil.com/   (prefix-bypass of bare-string check)
 *   • http://localhost@evil.com/    (URL-userinfo trick)
 *
 * After the fix, every host is parsed and resolved through TargetValidator.
 * This suite locks in that behaviour for both create-time AND delivery-time.
 */
class WebhookSsrfTest {

    /* ─── factories ──────────────────────────────────────────────────────── */

    private WebhookController controllerInProd() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");
        return new WebhookController(
            new StubWebhookRepo(), new StubDeliveryRepo(),
            new AllowAllWorkspace(), new TargetValidator(), env);
    }

    private WebhookController controllerInDev() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("dev");
        return new WebhookController(
            new StubWebhookRepo(), new StubDeliveryRepo(),
            new AllowAllWorkspace(), new TargetValidator(), env);
    }

    private WebhookDeliveryWorker worker() {
        return new WebhookDeliveryWorker(new StubDeliveryRepo(), new StubWebhookRepo(), new TargetValidator());
    }

    /* ─── classic SSRF rejected (controller) ────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        // Cloud metadata
        "https://169.254.169.254/latest/meta-data/",
        "https://169.254.169.254/computeMetadata/v1/",
        "https://[fd00:ec2::254]/latest/meta-data/",
        "https://100.100.100.200/",                   // Alibaba IMDS
        "https://192.0.0.192/",                       // Oracle Cloud legacy
        // RFC 1918 private ranges
        "https://10.0.0.1/",
        "https://10.255.255.254/",
        "https://172.16.0.1/",
        "https://192.168.1.1/admin",
        // Loopback
        "https://127.0.0.1/",
        "https://127.255.255.254/",
        "https://[::1]/",
        // Multicast
        "https://224.0.0.1/",
        "https://239.255.255.250/",
        // Decimal-encoded loopback
        "https://2130706433/",
        // Wildcard / unspecified
        "https://0.0.0.0/",
        // IPv4-mapped IPv6 loopback
        "https://[::ffff:127.0.0.1]/",
    })
    void create_rejects_known_SSRF_payloads_in_production(String maliciousUrl) {
        WebhookController ctrl = controllerInProd();
        var req = new WebhookController.CreateRequest(
            UUID.randomUUID(), maliciousUrl, "generic", List.of("*"));
        assertThatThrownBy(() -> ctrl.create(req))
            .isInstanceOf(ApiException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        // Naive prefix-bypass attacks against the OLD startsWith() check
        "http://localhost.evil.com/",
        "http://localhost@evil.com/",
        // Plain HTTP not allowed
        "http://example.com/webhook",
        // Schemeless / non-http(s)
        "file:///etc/passwd",
        "gopher://internal:8080/",
        "javascript:alert(1)",
        // Malformed
        "not a url",
        "://no-scheme",
        "https://",
        "https:///",
    })
    void create_rejects_scheme_and_format_attacks(String evil) {
        WebhookController ctrl = controllerInProd();
        var req = new WebhookController.CreateRequest(
            UUID.randomUUID(), evil, "generic", List.of("*"));
        assertThatThrownBy(() -> ctrl.create(req)).isInstanceOf(ApiException.class);
    }

    /* ─── localhost allowed only in dev / test profiles ─────────────────── */

    @Test void create_rejects_http_localhost_in_production() {
        WebhookController prod = controllerInProd();
        var req = new WebhookController.CreateRequest(
            UUID.randomUUID(), "http://localhost:3000/webhook", "generic", List.of("*"));
        assertThatThrownBy(() -> prod.create(req)).isInstanceOf(ApiException.class);
    }

    @Test void create_accepts_http_localhost_in_dev_profile() {
        WebhookController dev = controllerInDev();
        var req = new WebhookController.CreateRequest(
            UUID.randomUUID(), "http://localhost:3000/webhook", "generic", List.of("*"));
        assertThatCode(() -> dev.create(req)).doesNotThrowAnyException();
    }

    @Test void create_accepts_legitimate_https_url_in_production() {
        WebhookController prod = controllerInProd();
        var req = new WebhookController.CreateRequest(
            UUID.randomUUID(), "https://hooks.slack.com/services/T0/B0/xxx", "slack", List.of("*"));
        assertThatCode(() -> prod.create(req)).doesNotThrowAnyException();
    }

    @Test void create_accepts_legitimate_https_url_with_uncommon_port() {
        WebhookController prod = controllerInProd();
        var req = new WebhookController.CreateRequest(
            UUID.randomUUID(), "https://api.pagerduty.com:8443/webhook", "pagerduty", List.of("*"));
        assertThatCode(() -> prod.create(req)).doesNotThrowAnyException();
    }

    /* ─── delivery-time defence-in-depth ────────────────────────────────── */

    @ParameterizedTest
    @ValueSource(strings = {
        "https://169.254.169.254/",
        "https://10.0.0.1/",
        "https://[::1]/",
        "https://127.0.0.1/admin",
        "https://[::ffff:10.0.0.1]/",
        "ftp://example.com/",
        "javascript:fetch('//evil')",
        "",
        "://malformed",
    })
    void worker_isSsrfSafeUrl_rejects_dangerous_urls(String dangerous) {
        assertThat(worker().isSsrfSafeUrl(dangerous)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://hooks.slack.com/services/AAA/BBB/CCC",
        "https://discord.com/api/webhooks/1234/abc",
        "https://example.com/endpoint",
        "https://example.com:8080/v1/webhook",  // uncommon port still allowed
    })
    void worker_isSsrfSafeUrl_accepts_legitimate_urls(String safe) {
        assertThat(worker().isSsrfSafeUrl(safe)).isTrue();
    }

    @Test void worker_isSsrfSafeUrl_handles_null() {
        assertThat(worker().isSsrfSafeUrl(null)).isFalse();
    }

    @Test void worker_isSsrfSafeUrl_handles_blank() {
        assertThat(worker().isSsrfSafeUrl("")).isFalse();
        assertThat(worker().isSsrfSafeUrl("   ")).isFalse();
    }

    /* ─── stubs ──────────────────────────────────────────────────────────── */

    static class AllowAllWorkspace extends WorkspaceService {
        AllowAllWorkspace() {
            super(null, null);
        }
        @Override public io.netscope.workspace.Workspace requireRole(UUID id, WorkspaceMember.Role... roles) {
            return null;
        }
        @Override public io.netscope.workspace.Workspace requireAccess(UUID id) {
            return null;
        }
    }

    static class StubWebhookRepo extends NoOpJpaRepository<Webhook, UUID> implements WebhookRepository {
        @Override public <S extends Webhook> S save(S entity) { return entity; }
        @Override public List<Webhook> findByWorkspaceId(UUID id) { return List.of(); }
        @Override public List<Webhook> findByWorkspaceIdAndActiveTrue(UUID id) { return List.of(); }
    }

    static class StubDeliveryRepo extends NoOpJpaRepository<WebhookDelivery, UUID> implements WebhookDeliveryRepository {
        @Override public List<WebhookDelivery> pending(Instant now, org.springframework.data.domain.Pageable p) { return List.of(); }
        @Override public List<WebhookDelivery> findByWebhookIdOrderByCreatedAtDesc(UUID id, org.springframework.data.domain.Pageable p) { return List.of(); }
    }
}
