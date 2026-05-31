package io.netscope.user;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSKeySelector;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * OIDC id_token verifier. Caches a {@link JWKSource} per provider so JWKS
 * fetches happen at most once every 5 minutes (per provider), then are
 * served from in-memory cache.
 *
 * Provides cryptographic verification of the token's signature against
 * the provider's published JWKS, plus the standard OIDC claim checks:
 * {@code iss}, {@code aud}, {@code exp}, {@code iat}, and {@code nonce}.
 *
 * F-RD3-04 (HIGH): {@code nonce} binding is REQUIRED outside dev/test
 * once the sign-in-start endpoint lands (see F-RD3-03). Callers must
 * pass the {@code expectedNonce} they minted at sign-in-start; the
 * verifier rejects any token whose {@code nonce} claim does not match,
 * using a constant-time compare so we don't leak the expected value
 * through a timing oracle. The legacy nonce-less overload remains as
 * a deprecated bridge during the cutover and emits a warn each call.
 *
 * Why this exists alongside {@link AuthController#fetchGoogle}: the
 * userinfo HTTP round-trip authenticates the user only through the
 * trust of the TLS chain to Google. Verifying the id_token signature
 * directly is faster (no network call on the hot path after JWKS warmup)
 * AND removes one trust hop — even a compromised CA can't forge a
 * provider-signed id_token unless they also compromise Google's private
 * key.
 */
@Service
public class OidcIdTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(OidcIdTokenVerifier.class);
    /** Refresh JWKS at most every 5 min. Most providers rotate keys far
     *  less often than that; the cache absorbs the inevitable burst of
     *  validation calls right after deploy. */
    private static final Duration JWKS_CACHE_TTL = Duration.ofMinutes(5);
    /** Hard upper bound for the JWKS fetch — providers occasionally
     *  go slow during their own outages, we don't want to block our
     *  auth flow longer than this. */
    private static final long JWKS_FETCH_TIMEOUT_MS = 5_000L;

    @Value("${netscope.oauth.google.client-id:}")
    private String googleClientId;
    @Value("${netscope.oauth.google.issuer:https://accounts.google.com}")
    private String googleIssuer;
    @Value("${netscope.oauth.google.jwks:https://www.googleapis.com/oauth2/v3/certs}")
    private String googleJwksUrl;

    private final Environment env;

    private final Map<String, ConfigurableJWTProcessor<SecurityContext>> processors =
        new ConcurrentHashMap<>();

    public OidcIdTokenVerifier(Environment env) {
        this.env = env;
    }

    /**
     * Startup-time refusal — mirrors {@link JwtService#init} so production
     * cannot accidentally boot with OIDC audience verification disabled.
     *
     * F-RD3-05 (CRITICAL) + F-RD3-01 (HIGH): a blank {@code client-id}
     * previously caused {@link #buildProcessor} to pass {@code null} as
     * the required audience, which silently disabled the {@code aud}
     * check. Any Google-signed id_token (from ANY OAuth application)
     * would then be accepted, allowing account takeover via a token
     * issued for an attacker-controlled app.
     *
     * Outside of dev/test profiles this refuses to boot if the
     * client-id is null/blank, so production deploys MUST set
     * {@code NETSCOPE_GOOGLE_CLIENT_ID}.
     */
    @PostConstruct
    void init() {
        boolean isBlank = googleClientId == null || googleClientId.isBlank();
        boolean isDevLike = isDevOrTestProfile();
        if (isBlank && !isDevLike) {
            throw new IllegalStateException(
                "netscope.oauth.google.client-id must be set outside dev/test profiles. "
                + "Setting it to blank disables OIDC audience verification and accepts "
                + "id_tokens from any Google OAuth application. See ADR or "
                + "security-review-2026q2-round3.md F-RD3-05.");
        }
        if (isBlank) {
            log.warn("⚠ netscope.oauth.google.client-id is blank. OIDC id_token audience "
                + "verification is DISABLED. Acceptable for dev/test profile={} only; "
                + "production deploys must set NETSCOPE_GOOGLE_CLIENT_ID.",
                String.join(",", env.getActiveProfiles()));
        }
    }

    private boolean isDevOrTestProfile() {
        for (String p : env.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(p) || "test".equalsIgnoreCase(p)) return true;
        }
        return false;
    }

    /** Exposed so AuthController can do a defensive belt-and-braces aud
     *  re-check after {@link #verify} returns — see F-RD3-05 / F-RD3-01. */
    public String getGoogleClientId() {
        return googleClientId;
    }

    /**
     * Verify an {@code id_token} from one of the supported OIDC
     * providers. Returns the verified claim set on success, throws
     * {@link IllegalArgumentException} on any failure.
     *
     * Validation steps (in nimbus order):
     *   1. Parse + validate the JWS structure.
     *   2. Verify the signature with the provider's published JWKS
     *      (key selected by {@code kid}).
     *   3. Validate {@code iss} matches the configured provider issuer.
     *   4. Validate {@code aud} contains our configured client_id.
     *   5. Validate {@code exp} + {@code iat} timestamps.
     *   6. F-RD3-04: when {@code expectedNonce} is supplied, validate
     *      the token's {@code nonce} claim matches in constant time.
     *
     * @param provider       {@code "google"} for now. GitHub is intentionally
     *                       NOT supported here — GitHub does not issue
     *                       OIDC-compliant id_tokens, only opaque access
     *                       tokens which can only be validated by the
     *                       userinfo round-trip in AuthController.
     * @param idToken        the raw JWT id_token from the OIDC provider.
     * @param expectedNonce  the nonce the caller minted at sign-in-start
     *                       (see F-RD3-03). When non-null, the verifier
     *                       requires the token's {@code nonce} claim to
     *                       match. May be null only during the cutover
     *                       window before F-RD3-03 lands; production
     *                       deploys MUST supply this.
     */
    public JWTClaimsSet verify(String provider, String idToken, String expectedNonce) {
        if (idToken == null || idToken.isBlank()) {
            throw new IllegalArgumentException("id_token is empty");
        }
        ConfigurableJWTProcessor<SecurityContext> processor = processors.computeIfAbsent(
            provider, this::buildProcessor);

        try {
            SignedJWT parsed = SignedJWT.parse(idToken);
            // nimbus's processor enforces signature + claim verification
            // in one call. The SecurityContext we pass is unused; we keep
            // null because no per-request side data is needed.
            JWTClaimsSet claims = processor.process(parsed, null);

            // F-RD3-04 (HIGH): bind the id_token to the nonce minted at
            // sign-in-start. Without this an attacker who captures a
            // valid id_token (e.g. via a malicious extension or a leaked
            // browser log) can replay it against /exchange. Constant-time
            // compare avoids a timing oracle (round 2 follow-up).
            if (expectedNonce != null) {
                String tokenNonce = (String) claims.getClaim("nonce");
                if (tokenNonce == null || !MessageDigest.isEqual(
                        tokenNonce.getBytes(StandardCharsets.UTF_8),
                        expectedNonce.getBytes(StandardCharsets.UTF_8))) {
                    throw new JOSEException("nonce mismatch");
                }
            }
            return claims;
        } catch (Exception e) {
            log.warn("OIDC id_token verification failed for provider={}: {}",
                provider, e.getClass().getSimpleName());
            throw new IllegalArgumentException(
                "id_token verification failed", e);
        }
    }

    /**
     * Legacy nonce-less overload — delegates with {@code null}. Kept only
     * to avoid a flag-day break of older callers during the F-RD3-04
     * rollout. New callers MUST use {@link #verify(String, String, String)}
     * with a real expected nonce; once F-RD3-03's sign-in-start endpoint
     * is the only entry point, this overload should be removed.
     *
     * @deprecated F-RD3-04: nonce binding is required. Use the three-arg
     *             overload and pass the nonce minted at sign-in-start.
     */
    @Deprecated
    public JWTClaimsSet verify(String provider, String idToken) {
        log.warn("Deprecated nonce-less OIDC verify() call for provider={}. "
            + "F-RD3-04: callers must pass the expected nonce minted at "
            + "sign-in-start (see F-RD3-03). This overload will be removed.",
            provider);
        return verify(provider, idToken, null);
    }

    private ConfigurableJWTProcessor<SecurityContext> buildProcessor(String provider) {
        if (!"google".equals(provider)) {
            throw new IllegalArgumentException(
                "id_token verification only supported for provider=google");
        }
        try {
            JWKSource<SecurityContext> jwks = JWKSourceBuilder
                .create(new URL(googleJwksUrl))
                .cache(JWKS_CACHE_TTL.toMillis(), JWKS_FETCH_TIMEOUT_MS)
                // Refresh ahead — schedule a background refresh before
                // the cache entry hits TTL so the auth hot path never
                // sees a synchronous JWKS fetch under load.
                .refreshAheadCache(true)
                .build();
            JWSKeySelector<SecurityContext> keySelector =
                new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, jwks);

            DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
            processor.setJWSKeySelector(keySelector);
            // Default claims verifier enforces iss + aud + exp + iat (plus
            // nbf if present) with the values we pass.
            Map<String, Object> requiredClaims = new HashMap<>();
            requiredClaims.put("iss", googleIssuer);
            // F-RD3-05 (CRITICAL) + F-RD3-01 (HIGH): pin aud to the
            // configured client_id. Reaching this point with a blank
            // value is only possible in dev/test (startup guard in
            // init() refuses to boot otherwise) — accept any aud in
            // that case so local fixtures still work, but the warning
            // emitted at startup makes the audit trail clear.
            String pinnedAud = (googleClientId == null || googleClientId.isBlank())
                ? null : googleClientId;
            processor.setJWTClaimsSetVerifier(new com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier<>(
                pinnedAud,
                new JWTClaimsSet.Builder().issuer(googleIssuer).build(),
                java.util.Set.of("sub", "iss", "iat", "exp")));
            return processor;
        } catch (Exception e) {
            throw new IllegalStateException(
                "Failed to build OIDC JWT processor for " + provider, e);
        }
    }
}
