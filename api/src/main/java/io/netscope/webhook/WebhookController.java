package io.netscope.webhook;

import io.netscope.common.ApiException;
import io.netscope.workspace.WorkspaceMember;
import io.netscope.workspace.WorkspaceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;

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
    private final SecureRandom random = new SecureRandom();

    public WebhookController(WebhookRepository w, WebhookDeliveryRepository d, WorkspaceService ws) {
        this.webhooks = w; this.deliveries = d; this.workspaces = ws;
    }

    @PostMapping
    public Map<String, Object> create(@Valid @RequestBody CreateRequest req) {
        workspaces.requireRole(req.workspaceId(), WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        if (!req.url().startsWith("https://") && !req.url().startsWith("http://localhost"))
            throw ApiException.badRequest("webhook URL must be HTTPS");
        Webhook wh = new Webhook();
        wh.setWorkspaceId(req.workspaceId());
        wh.setUrl(req.url()); wh.setKind(req.kind());
        wh.setEvents(req.events() == null || req.events().isEmpty() ? List.of("*") : req.events());
        wh.setSecret(generateSecret());
        wh = webhooks.save(wh);
        // Return the secret ONCE on creation; afterwards we never expose it again.
        return Map.of("webhook", wh, "secret", wh.getSecret());
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
        workspaces.requireRole(w.getWorkspaceId(), WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        webhooks.delete(w);
    }

    @GetMapping("/{id}/deliveries")
    public List<WebhookDelivery> history(@PathVariable UUID id) {
        Webhook w = webhooks.findById(id).orElseThrow(() -> ApiException.notFound("webhook"));
        workspaces.requireAccess(w.getWorkspaceId());
        return deliveries.findByWebhookIdOrderByCreatedAtDesc(id, PageRequest.of(0, 50));
    }

    private String generateSecret() {
        byte[] b = new byte[32]; random.nextBytes(b);
        StringBuilder sb = new StringBuilder("whsec_");
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
