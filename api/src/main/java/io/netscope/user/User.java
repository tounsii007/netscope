package io.netscope.user;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {
    @Id @GeneratedValue private UUID id;
    @Column(nullable = false, unique = true) private String email;
    private String name;
    @Column(name = "avatar_url") private String avatarUrl;
    @Column(name = "oauth_provider", nullable = false) private String oauthProvider;
    @Column(name = "oauth_subject", nullable = false) private String oauthSubject;
    @Column(name = "email_verified", nullable = false) private boolean emailVerified;
    @Column(name = "created_at") private Instant createdAt = Instant.now();
    @Column(name = "last_login_at") private Instant lastLoginAt;

    public UUID getId() { return id; }
    public String getEmail() { return email; } public void setEmail(String e) { this.email = e; }
    public String getName() { return name; } public void setName(String n) { this.name = n; }
    public String getAvatarUrl() { return avatarUrl; } public void setAvatarUrl(String a) { this.avatarUrl = a; }
    public String getOauthProvider() { return oauthProvider; } public void setOauthProvider(String p) { this.oauthProvider = p; }
    public String getOauthSubject() { return oauthSubject; } public void setOauthSubject(String s) { this.oauthSubject = s; }
    public boolean isEmailVerified() { return emailVerified; } public void setEmailVerified(boolean v) { this.emailVerified = v; }
    public void setLastLoginAt(Instant t) { this.lastLoginAt = t; }
}
