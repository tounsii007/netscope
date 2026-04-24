package io.netscope.status;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "status_pages")
public class StatusPage {
    @Id @GeneratedValue private UUID id;
    @Column(name = "workspace_id", nullable = false) private UUID workspaceId;
    @Column(nullable = false, unique = true) private String slug;
    @Column(nullable = false) private String name;
    private String description;
    @Column(name = "logo_url") private String logoUrl;
    @Column(name = "brand_color") private String brandColor;
    @Column(name = "public", nullable = false) private boolean publicAccess = true;
    @Column(name = "created_at") private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; } public void setWorkspaceId(UUID id) { this.workspaceId = id; }
    public String getSlug() { return slug; } public void setSlug(String s) { this.slug = s; }
    public String getName() { return name; } public void setName(String n) { this.name = n; }
    public String getDescription() { return description; } public void setDescription(String d) { this.description = d; }
    public String getLogoUrl() { return logoUrl; } public void setLogoUrl(String u) { this.logoUrl = u; }
    public String getBrandColor() { return brandColor; } public void setBrandColor(String c) { this.brandColor = c; }
    public boolean isPublicAccess() { return publicAccess; } public void setPublicAccess(boolean p) { this.publicAccess = p; }
}
