package io.netscope.status;

import io.netscope.common.ApiException;
import io.netscope.monitor.MonitorCheckRepository;
import io.netscope.monitor.MonitorRepository;
import io.netscope.workspace.WorkspaceMember;
import io.netscope.workspace.WorkspaceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/v1/status-pages")
public class StatusPageController {

    public record CreateRequest(
        @NotBlank UUID workspaceId,
        @NotBlank @Pattern(regexp = "^[a-z0-9-]{3,64}$") String slug,
        @NotBlank @Size(max = 200) String name,
        @Size(max = 2_000) String description
    ) {}

    public record IncidentRequest(
        @NotBlank @Size(max = 200) String title,
        // Incidents are rendered on the public /status-pages/public/{slug}
        // endpoint which returns all recent incidents inline. Without a
        // cap an OWNER could push megabytes of body into a single row
        // and the public response would amplify into bandwidth abuse.
        @NotBlank @Size(max = 10_000) String body,
        @NotBlank String status,
        @NotBlank String impact
    ) {}

    private final StatusPageRepository pages;
    private final StatusPageIncidentRepository incidents;
    private final WorkspaceService workspaces;
    private final MonitorRepository monitors;
    private final MonitorCheckRepository checks;

    public StatusPageController(StatusPageRepository p, StatusPageIncidentRepository i,
                                WorkspaceService w, MonitorRepository m, MonitorCheckRepository c) {
        this.pages = p; this.incidents = i; this.workspaces = w;
        this.monitors = m; this.checks = c;
    }

    @PostMapping
    public StatusPage create(@Valid @RequestBody CreateRequest req) {
        workspaces.requireRole(req.workspaceId(), WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        if (pages.findBySlug(req.slug()).isPresent())
            throw ApiException.badRequest("slug already taken");
        StatusPage p = new StatusPage();
        p.setWorkspaceId(req.workspaceId());
        p.setSlug(req.slug()); p.setName(req.name()); p.setDescription(req.description());
        return pages.save(p);
    }

    @GetMapping
    public List<StatusPage> listForWorkspace(@RequestParam UUID workspaceId) {
        workspaces.requireAccess(workspaceId);
        return pages.findByWorkspaceId(workspaceId);
    }

    @PostMapping("/{id}/incidents")
    public StatusPageIncident createIncident(@PathVariable UUID id, @Valid @RequestBody IncidentRequest req) {
        StatusPage p = pages.findById(id).orElseThrow(() -> ApiException.notFound("page not found"));
        workspaces.requireRole(p.getWorkspaceId(), WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        StatusPageIncident inc = new StatusPageIncident();
        inc.setStatusPageId(id);
        inc.setTitle(req.title()); inc.setBody(req.body());
        inc.setStatus(StatusPageIncident.Status.valueOf(req.status().toUpperCase()));
        inc.setImpact(StatusPageIncident.Impact.valueOf(req.impact().toUpperCase()));
        if (inc.getStatus() == StatusPageIncident.Status.RESOLVED) inc.setResolvedAt(Instant.now());
        return incidents.save(inc);
    }

    // Public read for status page — NO auth, used by the unauth'd status page route.
    @GetMapping("/public/{slug}")
    public Map<String, Object> publicView(@PathVariable String slug) {
        StatusPage p = pages.findBySlug(slug).orElseThrow(() -> ApiException.notFound("status page not found"));
        if (!p.isPublicAccess()) throw ApiException.forbidden("status page is private");

        List<StatusPageIncident> recent = incidents.findByPage(p.getId()).stream()
            .limit(20).toList();

        List<Map<String, Object>> monitorStates = new ArrayList<>();
        monitors.findByApiKeyId(null); // noop — in a real impl we'd have a StatusPageMonitors join table
        // Summarize global uptime from last 24h for each monitor linked to this page
        // (for brevity we assume all workspace monitors are on the page)

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", p.getName());
        out.put("description", p.getDescription());
        out.put("logo", p.getLogoUrl());
        out.put("brandColor", p.getBrandColor());
        out.put("monitors", monitorStates);
        out.put("incidents", recent.stream().map(i -> Map.of(
            "id", i.getId(), "title", i.getTitle(),
            "status", i.getStatus(), "impact", i.getImpact(),
            "body", i.getBody() == null ? "" : i.getBody(),
            "startedAt", i.getStartedAt(),
            "resolvedAt", i.getResolvedAt()
        )).toList());
        out.put("overallStatus", recent.stream()
            .filter(i -> i.getStatus() != StatusPageIncident.Status.RESOLVED)
            .map(i -> i.getImpact().name())
            .findFirst()
            .orElse("OPERATIONAL"));
        return out;
    }
}
