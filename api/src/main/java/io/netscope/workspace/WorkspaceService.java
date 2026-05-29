package io.netscope.workspace;

import io.netscope.common.errors.ApiException;
import io.netscope.user.SessionContext;
import io.netscope.user.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class WorkspaceService {

    private final WorkspaceRepository workspaces;
    private final WorkspaceMemberRepository members;
    private final SecureRandom random = new SecureRandom();

    public WorkspaceService(WorkspaceRepository w, WorkspaceMemberRepository m) {
        this.workspaces = w; this.members = m;
    }

    @Transactional
    public Workspace createPersonal(User user) {
        Workspace w = new Workspace();
        w.setSlug(deriveSlug(user.getEmail()));
        w.setName(user.getName() == null ? user.getEmail() : user.getName() + "'s workspace");
        w.setOwnerId(user.getId());
        w = workspaces.save(w);
        members.save(new WorkspaceMember(w.getId(), user.getId(), WorkspaceMember.Role.OWNER));
        return w;
    }

    public Workspace defaultFor(User user) {
        List<Workspace> ws = workspaces.findAllForUser(user.getId());
        if (ws.isEmpty()) return createPersonal(user);
        return ws.get(0);
    }

    public List<Map<String, Object>> listForUser(UUID userId) {
        return workspaces.findAllForUser(userId).stream()
            .map(w -> (Map<String, Object>) Map.<String, Object>of(
                "id", w.getId(), "slug", w.getSlug(), "name", w.getName(),
                "plan", w.getPlan(), "isOwner", w.getOwnerId().equals(userId)))
            .toList();
    }

    public Workspace requireAccess(UUID workspaceId) {
        UUID userId = SessionContext.requireUserId();
        members.findByWorkspaceIdAndUserId(workspaceId, userId)
            .orElseThrow(() -> ApiException.forbidden("not a member of this workspace"));
        return workspaces.findById(workspaceId).orElseThrow(() -> ApiException.notFound("workspace not found"));
    }

    public Workspace requireRole(UUID workspaceId, WorkspaceMember.Role... allowed) {
        UUID userId = SessionContext.requireUserId();
        WorkspaceMember m = members.findByWorkspaceIdAndUserId(workspaceId, userId)
            .orElseThrow(() -> ApiException.forbidden("not a member"));
        for (WorkspaceMember.Role r : allowed) if (m.getRole() == r)
            return workspaces.findById(workspaceId).orElseThrow(() -> ApiException.notFound("workspace not found"));
        throw ApiException.forbidden("insufficient role");
    }

    @Transactional
    public WorkspaceMember invite(UUID workspaceId, UUID userId, WorkspaceMember.Role role) {
        requireRole(workspaceId, WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        if (members.findByWorkspaceIdAndUserId(workspaceId, userId).isPresent())
            throw ApiException.badRequest("already a member");
        return members.save(new WorkspaceMember(workspaceId, userId, role));
    }

    @Transactional
    public void removeMember(UUID workspaceId, UUID userId) {
        Workspace w = requireRole(workspaceId, WorkspaceMember.Role.OWNER, WorkspaceMember.Role.ADMIN);
        if (w.getOwnerId().equals(userId)) throw ApiException.badRequest("cannot remove owner");
        members.deleteById(new WorkspaceMember.PK(workspaceId, userId));
    }

    public List<WorkspaceMember> listMembers(UUID workspaceId) {
        requireAccess(workspaceId);
        return members.findByWorkspaceId(workspaceId);
    }

    private String deriveSlug(String email) {
        String base = email.split("@")[0].replaceAll("[^a-z0-9]", "").toLowerCase();
        if (base.length() < 3) base = "user";
        if (base.length() > 32) base = base.substring(0, 32);
        for (int i = 0; i < 5; i++) {
            String candidate = i == 0 ? base : base + "-" + hex(3);
            if (workspaces.findBySlug(candidate).isEmpty()) return candidate;
        }
        return base + "-" + hex(6);
    }

    private String hex(int bytes) {
        byte[] b = new byte[bytes]; random.nextBytes(b);
        StringBuilder sb = new StringBuilder(); for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
