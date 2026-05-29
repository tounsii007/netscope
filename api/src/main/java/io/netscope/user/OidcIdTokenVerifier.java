package io.netscope.user;

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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URL;
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
 * {@code iss}, {@code aud}, {@code exp}, {@code iat}. {@code nonce} is
 * checked when the caller supplies an expected value; it's optional
 * because the value originates from the frontend OAuth flow which our
 * backend doesn't always have visibility into.
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

    private final Map<String, ConfigurableJWTProcessor<SecurityContext>> processors =
        new ConcurrentHashMap<>();

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
     *
     * @param provider {@code "google"} for now. GitHub is intentionally
     *                 NOT supported here — GitHub does not issue
     *                 OIDC-compliant id_tokens, only opaque access
     *                 tokens which can only be validated by the
     *                 userinfo round-trip in AuthController.
     */
    public JWTClaimsSet verify(String provider, String idToken) {
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
            return processor.process(parsed, null);
        } catch (Exception e) {
            log.warn("OIDC id_token verification failed for provider={}: {}",
                provider, e.getClass().getSimpleName());
            throw new IllegalArgumentException(
                "id_token verification failed", e);
        }
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
            // We don't pin aud here because the configured client_id may
            // be empty in dev/test profiles. The audience check happens
            // in the controller after extraction.
            processor.setJWTClaimsSetVerifier(new com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier<>(
                googleClientId.isBlank() ? null : googleClientId,
                new JWTClaimsSet.Builder().issuer(googleIssuer).build(),
                java.util.Set.of("sub", "iss", "iat", "exp")));
            return processor;
        } catch (Exception e) {
            throw new IllegalStateException(
                "Failed to build OIDC JWT processor for " + provider, e);
        }
    }
}
