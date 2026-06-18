package io.netscope.workspace;

import io.netscope.common.errors.ApiException;
import io.netscope.user.SessionContext;
import io.netscope.user.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces")
public class WorkspaceController {

    public record RenameRequest(@NotBlank String name) {}
    public record InviteRequest(@Email String email, @NotBlank String role) {}

    private final WorkspaceService service;
    private final WorkspaceRepository repo;
    private final UserRepository users;

    public WorkspaceController(WorkspaceService s, WorkspaceRepository r, UserRepository u) {
        this.service = s; this.repo = r; this.users = u;
    }

    @GetMapping
    public List<Map<String, Object>> mine() {
        return service.listForUser(SessionContext.requireUserId());
    }

    @GetMapping("/{id}")
    public Workspace get(@PathVariable UUID id) { return service.requireAccess(id); }

    @PatchMapping("/{id}")
    public Workspace rename(@PathVariable UUID id, @Valid @RequestBody RenameRequest req) {
        Workspace w = service.requireRole(id, WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        w.setName(req.name());
        return repo.save(w);
    }

    @GetMapping("/{id}/members")
    public List<WorkspaceMember> members(@PathVariable UUID id) { return service.listMembers(id); }

    @PostMapping("/{id}/members")
    public WorkspaceMember invite(@PathVariable UUID id, @Valid @RequestBody InviteRequest req) {
        // F-RD4-01 (MED): enumeration-defence — the role/authorization check
        // MUST run BEFORE any user lookup, and all post-auth failure paths
        // (no-such-user / unverified / etc.) MUST return the same generic
        // 404 so an attacker without admin rights on this workspace can't
        // tell registered emails apart from unregistered ones. Without this,
        // a hostile member (or anyone able to hit the endpoint) could probe
        // the user table by diffing error messages.
        // 1. Verify the caller has admin rights on this workspace.
        service.requireRole(id, WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        // 2. Validate role payload — pre-lookup, so a bad role still doesn't
        //    leak whether the email exists.
        WorkspaceMember.Role role;
        try { role = WorkspaceMember.Role.valueOf(req.role().toUpperCase()); }
        catch (Exception e) { throw ApiException.badRequest("role must be ADMIN or MEMBER"); }
        if (role == WorkspaceMember.Role.OWNER) throw ApiException.badRequest("cannot grant OWNER via invite");
        // 3. THEN look up the invitee. Same generic error whether the email
        //    is unknown or belongs to an unverified account.
        var invitee = users.findByEmail(req.email())
            .orElseThrow(() -> ApiException.notFound("invitation could not be created"));
        // 4. F-RD3-06 (HIGH): verified-email gate. Same generic error so
        //    registered / unregistered / unverified are indistinguishable
        //    to non-admins (F-RD4-01).
        if (!invitee.isEmailVerified()) {
            throw ApiException.notFound("invitation could not be created");
        }
        // 5. Issue the invite.
        return service.invite(id, invitee.getId(), role);
    }

    @DeleteMapping("/{id}/members/{userId}")
    public void remove(@PathVariable UUID id, @PathVariable UUID userId) {
        service.removeMember(id, userId);
    }
}
