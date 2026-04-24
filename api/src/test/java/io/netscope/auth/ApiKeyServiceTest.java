package io.netscope.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ApiKeyServiceTest {

    @Mock ApiKeyRepository repo;
    @InjectMocks ApiKeyService service;

    @Test void rejectsNullAndBlank() {
        assertThat(service.resolve(null)).isEmpty();
        assertThat(service.resolve("")).isEmpty();
        assertThat(service.resolve("   ")).isEmpty();
        verifyNoInteractions(repo);
    }

    @Test void rejectsTooShortKey() {
        assertThat(service.resolve("short")).isEmpty();
        verifyNoInteractions(repo);
    }

    @Test void rejectsTooLongKey() {
        String tooLong = "a".repeat(200);
        assertThat(service.resolve(tooLong)).isEmpty();
        verifyNoInteractions(repo);
    }

    @Test void sha256IsStableAndCorrectLength() {
        String hash = ApiKeyService.sha256("my-test-key");
        assertThat(hash).hasSize(64).matches("[0-9a-f]+");
        assertThat(ApiKeyService.sha256("my-test-key")).isEqualTo(hash);
    }

    @Test void lookupsByHash() {
        ApiKey key = new ApiKey();
        key.setKeyHash(ApiKeyService.sha256("netscope_live_xxxxxxxx"));
        when(repo.findByKeyHashAndActiveTrue(anyString())).thenReturn(Optional.of(key));

        var result = service.resolve("netscope_live_xxxxxxxx");
        assertThat(result).isPresent();
        verify(repo).findByKeyHashAndActiveTrue(key.getKeyHash());
    }

    @Test void timingSafeCompareRejectsMismatch() {
        ApiKey key = new ApiKey();
        key.setKeyHash("different_hash_value");
        when(repo.findByKeyHashAndActiveTrue(anyString())).thenReturn(Optional.of(key));
        assertThat(service.resolve("netscope_live_xxxxxxxx")).isEmpty();
    }
}
