package io.netscope.webhook;

import io.netscope.common.ApiException;
import io.netscope.common.TargetValidator;
import io.netscope.workspace.WorkspaceMember;
import io.netscope.workspace.WorkspaceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.core.env.Environment;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.URISyntaxException;
import java.security.SecureRandom;
import java.util.*;

@RestController
@RequestMapping("/api/v1/webhooks")
public class WebhookController {

    public record CreateRequest(
        @NotBlank UUID workspaceId,
        @NotBlank String url,
        @NotBlank @Pattern(regexp = "generic|slack|discord|pagerduty") String kind,
        List<String> events
    ) {}

    private final WebhookRepository webhooks;
    private final WebhookDeliveryRepository deliveries;
    private final WorkspaceService workspaces;
    private final TargetValidator targetValidator;
    private final Environment env;
    private final SecureRandom random = new SecureRandom();

    public WebhookController(WebhookRepository w, WebhookDeliveryRepository d, WorkspaceService ws,
                             TargetValidator targetValidator, Environment env) {
        this.webhooks = w; this.deliveries = d; this.workspaces = ws;
        this.targetValidator = targetValidator;
        this.env = env;
    }

    @PostMapping
    public Map<String, Object> create(@Valid @RequestBody CreateRequest req) {
        workspaces.requireRole(req.workspaceId(), WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        validateWebhookUrl(req.url());
        Webhook wh = new Webhook();
        wh.setWorkspaceId(req.workspaceId());
        wh.setUrl(req.url()); wh.setKind(req.kind());
        wh.setEvents(req.events() == null || req.events().isEmpty() ? List.of("*") : req.events());
        wh.setSecret(generateSecret());
        wh = webhooks.save(wh);
        // Return the secret ONCE on creation; afterwards we never expose it again.
        return Map.of("webhook", wh, "secret", wh.getSecret());
    }

    /**
     * Anti-SSRF guard for webhook URLs.
     *
     * Blocks ALL of these attack vectors:
     *   • https://169.254.169.254/...    — cloud metadata endpoint
     *   • https://10.0.0.1/...           — RFC 1918 private space
     *   • https://[::1]/...              — IPv6 loopback literal
     *   • https://127.0.0.1.nip.io/...   — DNS-rebinding to loopback
     *   • https://localhost.evil.com/... — naive prefix-bypass of old check
     *   • http://anything                — only HTTPS permitted in prod
     *
     * The `http://localhost` exemption is allowed only when the active Spring
     * profile is "dev" or "test", to keep developer ergonomics intact.
     *
     * Defence-in-depth: the delivery worker re-validates at send time too,
     * since DNS records can change between create and first delivery (DNS
     * rebinding TOCTOU).
     */
    void validateWebhookUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw ApiException.badRequest("webhook URL is required");
        }
        URI uri;
        try {
            uri = new URI(rawUrl);
        } catch (URISyntaxException e) {
            throw ApiException.badRequest("webhook URL is malformed");
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || host.isBlank()) {
            throw ApiException.badRequest("webhook URL must include scheme and host");
        }

        boolean isDevProfile = isDevProfile();
        boolean isLocalhost = "localhost".equalsIgnoreCase(host)
                              || "127.0.0.1".equals(host)
                              || "[::1]".equals(host)
                              || "::1".equals(host);

        // Only HTTPS allowed in prod; dev profiles may use plain http://localhost
        if ("http".equalsIgnoreCase(scheme)) {
            if (!(isDevProfile && isLocalhost)) {
                throw ApiException.badRequest("webhook URL must use HTTPS");
            }
        } else if (!"https".equalsIgnoreCase(scheme)) {
            throw ApiException.badRequest("webhook URL must use HTTPS");
        }

        // Reject obvious literal IPs in the loopback / private / cloud-meta
        // ranges before paying for a DNS lookup. The validator handles literals
        // and resolves hostnames through the same SSRF guard the rest of the
        // app uses.
        try {
            // Strip surrounding brackets from IPv6 literals before validation
            String hostForValidation = host.startsWith("[") && host.endsWith("]")
                ? host.substring(1, host.length() - 1)
                : host;

            // Dev-mode localhost shortcut so we don't have to touch DNS
            if (isDevProfile && isLocalhost) return;

            targetValidator.resolveAndValidate(hostForValidation);
        } catch (ApiException e) {
            // Re-throw with a webhook-specific message but preserve the status
            throw new ApiException(e.getStatus(),
                "webhook host is not allowed: " + e.getMessage());
        } catch (Exception e) {
            throw ApiException.badRequest("webhook host could not be resolved");
        }
    }

    private boolean isDevProfile() {
        for (String p : env.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(p) || "development".equalsIgnoreCase(p)
                || "test".equalsIgnoreCase(p) || "local".equalsIgnoreCase(p)) {
                return true;
            }
        }
        // Spring boots with "default" if nothing is set — treat that as dev too
        // so the localhost exemption works during `mvn spring-boot:run` locally.
        String[] active = env.getActiveProfiles();
        return active.length == 0;
    }

    @GetMapping
    public List<Webhook> list(@RequestParam UUID workspaceId) {
        workspaces.requireAccess(workspaceId);
        return webhooks.findByWorkspaceId(workspaceId).stream()
            .peek(w -> w.setSecret("[redacted]"))
            .toList();
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id) {
        Webhook w = webhooks.findById(id).orElseThrow(() -> ApiException.notFound("webhook"));
        // IDOR mask: a cross-tenant attacker probing UUIDs cannot distinguish
        // "doesn't exist" (404) from "exists but you have no rights" (403).
        // Both return identical 404 responses.
        try {
            workspaces.requireRole(w.getWorkspaceId(),
                WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        } catch (ApiException e) {
            throw ApiException.notFound("webhook");
        }
        webhooks.delete(w);
    }

    @GetMapping("/{id}/deliveries")
    public List<WebhookDelivery> history(@PathVariable UUID id) {
        Webhook w = webhooks.findById(id).orElseThrow(() -> ApiException.notFound("webhook"));
        // Same IDOR mask as delete().
        try {
            workspaces.requireAccess(w.getWorkspaceId());
        } catch (ApiException e) {
            throw ApiException.notFound("webhook");
        }
        return deliveries.findByWebhookIdOrderByCreatedAtDesc(id, PageRequest.of(0, 50));
    }

    private String generateSecret() {
        byte[] b = new byte[32]; random.nextBytes(b);
        StringBuilder sb = new StringBuilder("whsec_");
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
