package io.netscope.ctmonitor;

import io.netscope.common.errors.ApiException;
import io.netscope.workspace.WorkspaceMember;
import io.netscope.workspace.WorkspaceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Tag(name = "Telemetry", description = "Monitor Certificate Transparency logs for subscribed domains")
@RestController
@RequestMapping("/api/v1/ct")
public class CtMonitorController {

    public record SubscribeRequest(
        @NotBlank UUID workspaceId,
        @NotBlank @Pattern(regexp = "^[a-zA-Z0-9.-]{1,253}$") String domain,
        @Email String alertEmail
    ) {}

    private final CtSubscriptionRepository subs;
    private final CtObservationRepository obs;
    private final WorkspaceService workspaces;

    public CtMonitorController(CtSubscriptionRepository s, CtObservationRepository o, WorkspaceService w) {
        this.subs = s; this.obs = o; this.workspaces = w;
    }

    @Operation(summary = "Subscribe a domain to CT log monitoring")
    @PostMapping("/subscribe")
    public CtSubscription subscribe(@Valid @RequestBody SubscribeRequest req) {
        workspaces.requireRole(req.workspaceId(), WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        if (subs.findByWorkspaceIdAndDomain(req.workspaceId(), req.domain()).isPresent())
            throw ApiException.badRequest("already subscribed");
        CtSubscription s = new CtSubscription();
        s.setWorkspaceId(req.workspaceId());
        s.setDomain(req.domain());
        s.setAlertEmail(req.alertEmail());
        return subs.save(s);
    }

    @Operation(summary = "List CT subscriptions in a workspace")
    @GetMapping
    public List<CtSubscription> list(@RequestParam UUID workspaceId) {
        workspaces.requireAccess(workspaceId);
        return subs.findByWorkspaceId(workspaceId);
    }

    @Operation(summary = "List recent CT observations for a subscription")
    @GetMapping("/{id}/observations")
    public List<CtObservation> observations(@PathVariable UUID id) {
        CtSubscription s = subs.findById(id).orElseThrow(() -> ApiException.notFound("subscription"));
        workspaces.requireAccess(s.getWorkspaceId());
        return obs.findTop50BySubscriptionIdOrderByObservedAtDesc(id);
    }

    @Operation(summary = "Unsubscribe a domain from CT monitoring")
    @DeleteMapping("/{id}")
    public void unsubscribe(@PathVariable UUID id) {
        CtSubscription s = subs.findById(id).orElseThrow(() -> ApiException.notFound("subscription"));
        workspaces.requireRole(s.getWorkspaceId(), WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        subs.delete(s);
    }
}
