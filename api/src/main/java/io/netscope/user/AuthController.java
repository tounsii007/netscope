package io.netscope.user;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.errors.ApiException;
import io.netscope.common.security.ClientIpResolver;
import io.netscope.workspace.Workspace;
import io.netscope.workspace.WorkspaceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    /**
     * Exchange request. {@code accessToken} is REQUIRED for the legacy
     * userinfo-round-trip path. {@code idToken} is OPTIONAL and, when
     * present (Google only — GitHub doesn't issue OIDC id_tokens),
     * triggers the verified-signature path which skips the userinfo
     * call entirely and trusts the cryptographically-verified claims.
     *
     * Prefer sending {@code idToken} from the frontend when available
     * — it eliminates one network round-trip per login + removes the
     * trust-anchor dependency on the TLS chain to userinfo.googleapis.com.
     *
     * F-RD3-03: {@code ticket} is the one-shot sign-in ticket the
     * frontend received from POST /api/v1/auth/start. It binds this
     * /exchange call to a backend-initiated sign-in attempt — without
     * it (or with a stale, replayed, or IP-mismatched one) the exchange
     * is rejected before any OAuth verification happens. Closes the
     * bearer-replay window where a captured access_token/id_token could
     * be POSTed straight to /exchange and mint a netscope JWT.
     */
    public record ExchangeRequest(
        @NotBlank @Pattern(regexp = "github|google") String provider,
        @NotBlank String accessToken,
        String idToken,
        @NotBlank String ticket
    ) {}

    private final UserRepository users;
    private final JwtService jwt;
    private final WorkspaceService workspaces;
    private final OidcIdTokenVerifier oidc;
    private final SignInTicketService tickets;
    private final RestClient rest = RestClient.create();
    private final ObjectMapper mapper = new ObjectMapper();

    @Value("${netscope.oauth.github.userinfo:https://api.github.com/user}")
    private String githubUserinfo;
    @Value("${netscope.oauth.github.emails:https://api.github.com/user/emails}")
    private String githubEmails;
    @Value("${netscope.oauth.google.userinfo:https://openidconnect.googleapis.com/v1/userinfo}")
    private String googleUserinfo;
    @Value("${netscope.oauth.google.client-id:}")
    private String googleClientId;

    public AuthController(UserRepository users, JwtService jwt,
                          WorkspaceService workspaces, OidcIdTokenVerifier oidc,
                          SignInTicketService tickets) {
        this.users = users; this.jwt = jwt; this.workspaces = workspaces;
        this.oidc = oidc; this.tickets = tickets;
    }

    @PostMapping("/exchange")
    @Transactional
    public Map<String, Object> exchange(
            @Valid @org.springframework.web.bind.annotation.RequestBody ExchangeRequest req,
            HttpServletRequest http) {

        // F-RD3-03: redeem the one-shot ticket BEFORE touching the OAuth
        // provider. Closes the bearer-replay window: a captured
        // access_token/id_token is useless against /exchange without a
        // matching, unconsumed, IP-bound ticket minted at /auth/start.
        // verifyAndConsume() throws IllegalArgumentException on any
        // failure (bad sig, expired, IP mismatch, already-redeemed) —
        // map that to 401 so a leaked-ticket probe doesn't get a 400
        // that might mislead a caller into thinking the request shape
        // is the problem.
        SignInTicketService.Redeemed redeemed;
        try {
            redeemed = tickets.verifyAndConsume(
                req.ticket(), ClientIpResolver.clientIp(http));
        } catch (IllegalArgumentException e) {
            log.warn("Sign-in ticket rejected: {}", e.getMessage());
            throw new ApiException(
                org.springframework.http.HttpStatus.UNAUTHORIZED,
                "Sign-in ticket invalid or expired. Restart the sign-in.");
        }
        // F-RD3-04 plumb-through: the nonce the frontend forwarded to
        // the OIDC provider (and Google echoed back into the id_token)
        // came FROM the ticket. We use it as the expected-nonce on the
        // id_token verification path so a token whose nonce doesn't
        // match THIS sign-in attempt is rejected.
        String expectedNonce = redeemed.nonce();

        OauthUser oauth;
        // Preferred path: a verified OIDC id_token. Cryptographically
        // proves the token came from the issuer (Google) without
        // depending on a userinfo round-trip. Skipped for github since
        // GitHub doesn't issue OIDC id_tokens at all.
        if ("google".equals(req.provider())
            && req.idToken() != null && !req.idToken().isBlank()) {
            oauth = fetchGoogleFromIdToken(req.idToken(), expectedNonce);
        } else {
            oauth = switch (req.provider()) {
                case "github" -> fetchGithub(req.accessToken());
                case "google" -> fetchGoogle(req.accessToken());
                default -> throw ApiException.badRequest("unsupported provider");
            };
        }

        // F-RD3-06 (HIGH): refuse first-time sign-ins where the OAuth provider
        // has NOT verified the email. Otherwise an attacker who controls an
        // OAuth account with an arbitrary unverified email could provision a
        // brand-new netscope user bound to a victim's address, then accept a
        // pending workspace invite addressed to that victim (email-takeover
        // + invite-hijack). Existing bindings keep working — we only gate
        // *creation* on a verified email, so already-onboarded users who
        // somehow lost their verified flag at the IdP can still log back in.
        boolean existing = users.findByOauthProviderAndOauthSubject(
            req.provider(), oauth.subject()).isPresent();
        if (!oauth.emailVerified() && !existing) {
            throw ApiException.forbidden(
                "Sign-in requires a verified email at the OAuth provider. " +
                "Verify your email with Google/GitHub and retry.");
        }

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
        catch (Exception e) { throw ApiException.sanitizedFailure(log, "GitHub userinfo failed", e); }
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
        } catch (Exception e) { throw ApiException.sanitizedFailure(log, "Google userinfo failed", e); }
    }

    /**
     * Extract OauthUser directly from a signature-verified Google id_token.
     * No network call — the signature check + claim validation happens
     * locally against a cached JWKS. Throws {@link ApiException} (400)
     * on any verification failure, which the global handler surfaces
     * with a correlation ID.
     *
     * F-RD3-03 + F-RD3-04: {@code expectedNonce} is the nonce minted at
     * /api/v1/auth/start and carried inside the one-shot ticket the
     * caller already redeemed. The verifier rejects any id_token whose
     * {@code nonce} claim doesn't match, closing the captured-id_token
     * replay window.
     */
    private OauthUser fetchGoogleFromIdToken(String idToken, String expectedNonce) {
        try {
            com.nimbusds.jwt.JWTClaimsSet claims = oidc.verify("google", idToken, expectedNonce);
            // F-RD3-05 (CRITICAL) + F-RD3-01 (HIGH): defensive belt-and-
            // braces aud re-check. The nimbus verifier already enforces
            // aud when client_id is configured, but if the verifier is
            // ever reconfigured to skip aud (e.g. a future change passes
            // null again), this check still rejects mismatched tokens.
            // Skipped only when client_id itself is blank (= dev/test
            // profile, per the startup guard in OidcIdTokenVerifier).
            if (googleClientId != null && !googleClientId.isBlank()) {
                java.util.List<String> aud = claims.getAudience();
                if (aud == null || !aud.contains(googleClientId)) {
                    throw ApiException.forbidden("id_token audience mismatch");
                }
            }
            String sub = claims.getSubject();
            String email = claims.getStringClaim("email");
            if (sub == null || email == null) {
                throw ApiException.badRequest("id_token missing sub or email claim");
            }
            String name = claims.getStringClaim("name");
            String picture = claims.getStringClaim("picture");
            Boolean verified = claims.getBooleanClaim("email_verified");
            return new OauthUser(sub, email, name, picture,
                Boolean.TRUE.equals(verified));
        } catch (ApiException e) { throw e; }
        catch (Exception e) {
            // Verification failures are SECURITY-RELEVANT — surface
            // them with the correlation ID pattern but keep the public
            // message free of crypto-library internals.
            throw ApiException.sanitizedFailure(log, "id_token verification failed", e);
        }
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
