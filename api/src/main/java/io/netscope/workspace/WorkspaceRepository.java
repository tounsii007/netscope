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

    /**
     * Rewritten from an implicit cross-join shape
     *   FROM Workspace w, WorkspaceMember m WHERE w.id = m.workspaceId AND ...
     * to an explicit INNER JOIN. Some Hibernate versions still
     * materialise the cartesian product before applying the WHERE
     * filter — with N workspaces × M member rows that's an N·M
     * intermediate set in memory before the planner discards 99%
     * of rows. At 10k+ workspaces the latency becomes visible.
     *
     * The explicit JOIN form makes the access pattern unambiguous
     * to the optimiser and to readers.
     */
    @Query("""
        SELECT w FROM Workspace w
        INNER JOIN WorkspaceMember m ON m.workspaceId = w.id
        WHERE m.userId = :userId
        ORDER BY w.createdAt ASC
        """)
    List<Workspace> findAllForUser(@Param("userId") UUID userId);
}
