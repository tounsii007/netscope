package io.netscope.user;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/**
 * Tiny HS256 JWT implementation. Small, auditable, no external dependency chain.
 * For multi-region we'd swap to RS256 with a rotating keyset exposed via JWKS.
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

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
    private final ObjectMapper mapper = new ObjectMapper();
    private SecretKeySpec keySpec;

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
        // refuse to boot. Earlier this keyed on isProd, but a deploy
        // that forgot SPRING_PROFILES_ACTIVE=prod (or used "staging"
        // / "live" / "preview") would silently accept the well-known
        // placeholder. Invert: secure-by-default.
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

        keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    /**
     * True iff the active profile set explicitly includes "dev" or
     * "test". An empty profile list, "prod", "staging", "live",
     * "preview", or any custom name all return false — and therefore
     * the placeholder-secret check trips.
     */
    private boolean isDevOrTestProfile() {
        for (String p : env.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(p) || "test".equalsIgnoreCase(p)) return true;
        }
        return false;
    }

    public String issue(UUID userId, String email, Map<String, Object> extras) {
        try {
            long now = Instant.now().getEpochSecond();
            Map<String, Object> claims = new LinkedHashMap<>();
            claims.put("sub", userId.toString());
            claims.put("iss", issuer);
            claims.put("iat", now);
            claims.put("exp", now + ttlSeconds);
            claims.put("email", email);
            claims.putAll(extras);

            String header = b64(mapper.writeValueAsBytes(Map.of("alg", "HS256", "typ", "JWT")));
            String body   = b64(mapper.writeValueAsBytes(claims));
            String signingInput = header + "." + body;
            String sig = b64(hmac(signingInput));
            return signingInput + "." + sig;
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public Map<String, Object> parse(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) return null;
            // Reject any token whose header doesn't declare HS256.
            // Today the HMAC compare below catches `{"alg":"none"}` tokens
            // anyway (the empty signature byte array won't match the
            // expected HMAC), but an explicit allow-list is cheap
            // defense-in-depth: when the codebase later adds a second
            // algorithm branch (RS256 migration noted in the class
            // javadoc), the missing whitelist becomes the classic
            // algorithm-confusion vulnerability. Lock it down now.
            @SuppressWarnings("unchecked")
            Map<String, Object> header = mapper.readValue(
                Base64.getUrlDecoder().decode(parts[0]), Map.class);
            if (!"HS256".equals(header.get("alg"))) return null;
            if (!"JWT".equals(header.get("typ"))) return null;

            String signingInput = parts[0] + "." + parts[1];
            byte[] expected = hmac(signingInput);
            byte[] got = Base64.getUrlDecoder().decode(parts[2]);
            if (!java.security.MessageDigest.isEqual(expected, got)) return null;

            @SuppressWarnings("unchecked")
            Map<String, Object> claims = mapper.readValue(Base64.getUrlDecoder().decode(parts[1]), Map.class);
            Object exp = claims.get("exp");
            if (exp instanceof Number n && n.longValue() < Instant.now().getEpochSecond()) return null;
            if (!issuer.equals(claims.get("iss"))) return null;
            return claims;
        } catch (Exception e) { return null; }
    }

    private byte[] hmac(String s) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(keySpec);
        return mac.doFinal(s.getBytes(StandardCharsets.UTF_8));
    }

    private String b64(byte[] b) { return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }
}
