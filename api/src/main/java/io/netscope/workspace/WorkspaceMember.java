package io.netscope.workspace;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "workspace_members")
@IdClass(WorkspaceMember.PK.class)
public class WorkspaceMember {
    public enum Role { OWNER, ADMIN, MEMBER }

    @Id @Column(name = "workspace_id") private UUID workspaceId;
    @Id @Column(name = "user_id") private UUID userId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Role role;
    @Column(name = "joined_at") private Instant joinedAt = Instant.now();

    public WorkspaceMember() {}
    public WorkspaceMember(UUID ws, UUID user, Role role) {
        this.workspaceId = ws; this.userId = user; this.role = role;
    }
    public UUID getWorkspaceId() { return workspaceId; }
    public UUID getUserId() { return userId; }
    public Role getRole() { return role; } public void setRole(Role r) { this.role = r; }

    public static class PK implements Serializable {
        private UUID workspaceId; private UUID userId;
        public PK() {} public PK(UUID w, UUID u) { this.workspaceId = w; this.userId = u; }
        public int hashCode() { return Objects.hash(workspaceId, userId); }
        public boolean equals(Object o) {
            return o instanceof PK pk && Objects.equals(workspaceId, pk.workspaceId) && Objects.equals(userId, pk.userId);
        }
    }
}
