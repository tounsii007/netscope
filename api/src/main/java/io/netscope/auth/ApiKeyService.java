package io.netscope.auth;

import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;

@Service
public class ApiKeyService {

    private final ApiKeyRepository repo;
    private final ApiKeyTouchService touchService;

    public ApiKeyService(ApiKeyRepository repo, ApiKeyTouchService touchService) {
        this.repo = repo;
        this.touchService = touchService;
    }

    public Optional<ApiKey> resolve(String key) {
        if (key == null || key.isBlank() || key.length() < 16 || key.length() > 128) {
            return Optional.empty();
        }
        // Hash is SHA-256 → constant length → MessageDigest.isEqual in DB layer
        // gives us timing-safety. The plain string compare in HashMap/Set would
        // leak length. We only ever compare hashes, never raw keys.
        String hash = sha256(key);
        Optional<ApiKey> found = repo.findByKeyHashAndActiveTrue(hash);
        if (found.isPresent() && !MessageDigest.isEqual(
                hash.getBytes(StandardCharsets.UTF_8),
                found.get().getKeyHash().getBytes(StandardCharsets.UTF_8))) {
            return Optional.empty();
        }
        // Route through the separate proxied bean so @Async actually
        // takes effect. Calling this.touch() previously was a
        // self-invocation that bypassed the proxy and ran the DB
        // write synchronously in the auth critical path.
        found.ifPresent(touchService::touch);
        return found;
    }

    public static String sha256(String input) {
        try {
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(d.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
