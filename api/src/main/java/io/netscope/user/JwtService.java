package io.netscope.user;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
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

    @Value("${netscope.jwt.secret}")
    private String secret;

    @Value("${netscope.jwt.issuer}")
    private String issuer;

    @Value("${netscope.jwt.ttl-seconds:3600}")
    private long ttlSeconds;

    private final ObjectMapper mapper = new ObjectMapper();
    private SecretKeySpec keySpec;

    @PostConstruct
    void init() {
        if (secret == null || secret.length() < 32) {
            throw new IllegalStateException("netscope.jwt.secret must be >= 32 chars");
        }
        keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
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
