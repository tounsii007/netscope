package io.netscope.user;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.ApiException;
import io.netscope.workspace.Workspace;
import io.netscope.workspace.WorkspaceService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.*;

/**
 * Frontend (NextAuth) finishes the OAuth dance and POSTs the provider's access
 * token here. We verify the token by calling the provider's /userinfo, find-or-
 * create the user + default workspace, then issue our own JWT. This keeps the
 * provider's long-lived token out of the browser's localStorage.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    public record ExchangeRequest(
        @NotBlank @Pattern(regexp = "github|google") String provider,
        @NotBlank String accessToken
    ) {}

    private final UserRepository users;
    private final JwtService jwt;
    private final WorkspaceService workspaces;
    private final RestClient rest = RestClient.create();
    private final ObjectMapper mapper = new ObjectMapper();

    @Value("${netscope.oauth.github.userinfo:https://api.github.com/user}")
    private String githubUserinfo;
    @Value("${netscope.oauth.github.emails:https://api.github.com/user/emails}")
    private String githubEmails;
    @Value("${netscope.oauth.google.userinfo:https://openidconnect.googleapis.com/v1/userinfo}")
    private String googleUserinfo;

    public AuthController(UserRepository users, JwtService jwt, WorkspaceService workspaces) {
        this.users = users; this.jwt = jwt; this.workspaces = workspaces;
    }

    @PostMapping("/exchange")
    @Transactional
    public Map<String, Object> exchange(@org.springframework.web.bind.annotation.RequestBody ExchangeRequest req) {
        OauthUser oauth = switch (req.provider()) {
            case "github" -> fetchGithub(req.accessToken());
            case "google" -> fetchGoogle(req.accessToken());
            default -> throw ApiException.badRequest("unsupported provider");
        };

        User user = users.findByOauthProviderAndOauthSubject(req.provider(), oauth.subject())
            .orElseGet(() -> {
                User u = new User();
                u.setEmail(oauth.email());
                u.setName(oauth.name());
                u.setAvatarUrl(oauth.avatarUrl());
                u.setOauthProvider(req.provider());
                u.setOauthSubject(oauth.subject());
                u.setEmailVerified(oauth.emailVerified());
                User saved = users.save(u);
                workspaces.createPersonal(saved);
                return saved;
            });

        user.setLastLoginAt(Instant.now());
        users.save(user);

        Workspace defaultWs = workspaces.defaultFor(user);
        String token = jwt.issue(user.getId(), user.getEmail(),
            Map.of("name", user.getName() == null ? "" : user.getName(),
                   "workspace", defaultWs.getSlug()));

        return Map.of(
            "token", token,
            "user", Map.of(
                "id", user.getId(), "email", user.getEmail(),
                "name", user.getName(), "avatar", user.getAvatarUrl()),
            "workspace", Map.of(
                "id", defaultWs.getId(), "slug", defaultWs.getSlug(),
                "name", defaultWs.getName(), "plan", defaultWs.getPlan())
        );
    }

    private record OauthUser(String subject, String email, String name, String avatarUrl, boolean emailVerified) {}

    private OauthUser fetchGithub(String token) {
        try {
            String body = rest.get().uri(githubUserinfo)
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/vnd.github+json")
                .retrieve().body(String.class);
            JsonNode j = mapper.readTree(body);
            String email = j.path("email").asText(null);
            if (email == null) email = fetchGithubPrimaryEmail(token);
            if (email == null) throw ApiException.badRequest("GitHub email unavailable");
            return new OauthUser(j.path("id").asText(), email,
                j.path("name").asText(null), j.path("avatar_url").asText(null), true);
        } catch (ApiException e) { throw e; }
        catch (Exception e) { throw ApiException.badRequest("GitHub userinfo failed: " + e.getMessage()); }
    }

    private String fetchGithubPrimaryEmail(String token) {
        try {
            String body = rest.get().uri(githubEmails)
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/vnd.github+json")
                .retrieve().body(String.class);
            JsonNode arr = mapper.readTree(body);
            for (JsonNode n : arr) if (n.path("primary").asBoolean() && n.path("verified").asBoolean())
                return n.path("email").asText();
            return null;
        } catch (Exception e) { return null; }
    }

    private OauthUser fetchGoogle(String token) {
        try {
            String body = rest.get().uri(googleUserinfo)
                .header("Authorization", "Bearer " + token)
                .retrieve().body(String.class);
            JsonNode j = mapper.readTree(body);
            return new OauthUser(j.path("sub").asText(),
                j.path("email").asText(),
                j.path("name").asText(null),
                j.path("picture").asText(null),
                j.path("email_verified").asBoolean(false));
        } catch (Exception e) { throw ApiException.badRequest("Google userinfo failed: " + e.getMessage()); }
    }

    @GetMapping("/me")
    public Map<String, Object> me() {
        if (SessionContext.get() == null) throw ApiException.forbidden("not authenticated");
        User u = users.findById(SessionContext.get().userId())
            .orElseThrow(() -> ApiException.notFound("user not found"));
        return Map.of("id", u.getId(), "email", u.getEmail(),
            "name", u.getName(), "avatar", u.getAvatarUrl(),
            "workspaces", workspaces.listForUser(u.getId()));
    }
}
