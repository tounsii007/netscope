package io.netscope.workspace;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {
    Optional<Workspace> findBySlug(String slug);
    Optional<Workspace> findByStripeCustomerId(String stripeCustomerId);

    @Query("""
        SELECT w FROM Workspace w, WorkspaceMember m
        WHERE w.id = m.workspaceId AND m.userId = :userId
        ORDER BY w.createdAt ASC
        """)
    List<Workspace> findAllForUser(@Param("userId") UUID userId);
}
