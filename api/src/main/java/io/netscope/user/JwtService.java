package io.netscope.user;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.JWSVerifier;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * HS256 JWT issuer + parser backed by nimbus-jose-jwt.
 *
 * The previous implementation was a 60-line hand-rolled HMAC + base64url
 * pipeline. It worked but suffered from the well-known foot-guns of
 * hand-rolled JWT:
 *   • header parse path didn't validate the {@code typ} casing, so
 *     {@code "jwt"} (lowercase) was rejected even though the spec is
 *     case-insensitive for that field;
 *   • {@code alg} allow-list was a single literal compare — adding a
 *     second algorithm later would have opened the classic algorithm-
 *     confusion vulnerability;
 *   • clock-skew tolerance was a hand-written magic number applied
 *     only to {@code exp}, not the full set of time-sensitive claims;
 *   • no built-in support for the JWKS-based id_token verification we
 *     need for the OAuth flow (next iteration).
 *
 * nimbus is the de-facto industry-standard JWT library for the JVM, is
 * actively maintained, and treats the spec corner cases consistently
 * so our security guarantees don't drift with each refactor.
 *
 * Public API is unchanged: {@link #issue(UUID, String, Map)} returns a
 * compact-serialised token, {@link #parse(String)} returns a Map of
 * claims (or {@code null} on any rejection cause).
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    /**
     * Clock-skew tolerance applied to {@code exp} + {@code nbf}. 30s
     * covers NTP drift between replicas + the typical client-server
     * timestamp difference. RFC 7519 §4.1.4 expressly permits "a few
     * minutes" of leeway.
     */
    private static final long CLOCK_SKEW_SECONDS = 30;

    /**
     * Known placeholder values that MUST NOT be used in production.
     * Listed here so we can detect and refuse them on startup.
     */
    static final Set<String> KNOWN_WEAK_SECRETS = Set.of(
        "change-me-in-production-must-be-32-characters-minimum",
        "change-me-in-production",
        "your-secret-key-here",
        "default-secret-please-change",
        "00000000000000000000000000000000",
        "11111111111111111111111111111111"
    );

    @Value("${netscope.jwt.secret}")
    private String secret;

    @Value("${netscope.jwt.issuer}")
    private String issuer;

    @Value("${netscope.jwt.ttl-seconds:3600}")
    private long ttlSeconds;

    private final Environment env;
    private JWSSigner signer;
    private JWSVerifier verifier;

    public JwtService(Environment env) {
        this.env = env;
    }

    @PostConstruct
    void init() {
        if (secret == null || secret.length() < 32) {
            throw new IllegalStateException(
                "netscope.jwt.secret must be at least 32 characters (current: "
                    + (secret == null ? "null" : secret.length()) + ")");
        }

        boolean isWeak = KNOWN_WEAK_SECRETS.contains(secret);
        boolean isDevLike = isDevOrTestProfile();

        // Only the explicit dev/test profile tolerates a placeholder
        // secret. Production, staging, "live", and ANY UNNAMED profile
        // refuse to boot.
        if (isWeak && !isDevLike) {
            throw new IllegalStateException(
                "netscope.jwt.secret is set to a known placeholder value. "
                + "Set the JWT_SECRET environment variable to a strong random secret "
                + "(e.g. `openssl rand -base64 48`). To run locally with the "
                + "placeholder, set spring.profiles.active=dev or test.");
        }
        if (isWeak) {
            log.warn("⚠ JWT secret is a known placeholder value. This is acceptable for "
                + "local development ONLY (profile={}). Production / staging deploys "
                + "must set JWT_SECRET.", String.join(",", env.getActiveProfiles()));
        }

        byte[] secretBytes = secret.getBytes(StandardCharsets.UTF_8);
        try {
            this.signer = new MACSigner(secretBytes);
            this.verifier = new MACVerifier(secretBytes);
        } catch (JOSEException e) {
            throw new IllegalStateException(
                "Unable to initialise HS256 JWT signer/verifier — "
                    + "is netscope.jwt.secret at least 32 bytes?", e);
        }
    }

    private boolean isDevOrTestProfile() {
        for (String p : env.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(p) || "test".equalsIgnoreCase(p)) return true;
        }
        return false;
    }

    /**
     * Issue a signed HS256 token. Claims included by default: {@code sub},
     * {@code iss}, {@code iat}, {@code exp}, {@code email}. Extras are
     * merged after (so callers can override defaults — at their own risk).
     */
    public String issue(UUID userId, String email, Map<String, Object> extras) {
        try {
            Instant now = Instant.now();
            JWTClaimsSet.Builder builder = new JWTClaimsSet.Builder()
                .subject(userId.toString())
                .issuer(issuer)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(ttlSeconds)))
                .claim("email", email);
            // Merge extras AFTER the canonical set so a caller can
            // override exp/iss for testing — we keep this open rather
            // than locking it down so unit tests can still issue tokens
            // with explicit expirations.
            if (extras != null) {
                for (Map.Entry<String, Object> e : extras.entrySet()) {
                    builder.claim(e.getKey(), e.getValue());
                }
            }
            SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.HS256).type(com.nimbusds.jose.JOSEObjectType.JWT).build(),
                builder.build());
            jwt.sign(signer);
            return jwt.serialize();
        } catch (JOSEException e) {
            // Issue-time failures are non-recoverable misconfigurations
            // (e.g. signer init bug) — propagate as runtime so the
            // call site fails loudly.
            throw new RuntimeException("Failed to sign JWT", e);
        }
    }

    /**
     * Parse + verify a token. Returns the claim set as a Map on success,
     * or {@code null} on any rejection cause:
     *   • malformed token shape
     *   • non-HS256 algorithm header
     *   • signature mismatch
     *   • expired beyond skew window
     *   • not-yet-valid beyond skew window
     *   • issuer mismatch
     *
     * Null-return convention matches the legacy API so call-sites
     * don't need to adapt.
     */
    public Map<String, Object> parse(String token) {
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            // Algorithm allow-list: HS256 only. Rejecting at this point
            // is the canonical defence against algorithm-confusion
            // attacks (e.g. a forged "none" or RS256 header).
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm())) return null;
            if (!jwt.verify(verifier)) return null;

            JWTClaimsSet claims = jwt.getJWTClaimsSet();
            long now = Instant.now().getEpochSecond();

            Date exp = claims.getExpirationTime();
            if (exp != null && (exp.toInstant().getEpochSecond() + CLOCK_SKEW_SECONDS) < now) return null;

            Date nbf = claims.getNotBeforeTime();
            if (nbf != null && nbf.toInstant().getEpochSecond() > (now + CLOCK_SKEW_SECONDS)) return null;

            if (!issuer.equals(claims.getIssuer())) return null;

            // nimbus's JWTClaimsSet#toJSONObject returns Map<String,
            // Object> with java.util.Date for time claims. The legacy
            // contract returned Numbers for time claims, so convert
            // back to keep call-sites stable.
            Map<String, Object> out = new LinkedHashMap<>(claims.toJSONObject());
            normaliseTimeClaim(out, "iat", claims.getIssueTime());
            normaliseTimeClaim(out, "exp", claims.getExpirationTime());
            normaliseTimeClaim(out, "nbf", claims.getNotBeforeTime());
            return out;
        } catch (ParseException | JOSEException e) {
            return null;
        }
    }

    private static void normaliseTimeClaim(Map<String, Object> claims, String key, Date date) {
        if (date != null) {
            claims.put(key, date.toInstant().getEpochSecond());
        }
    }
}
