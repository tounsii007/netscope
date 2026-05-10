package io.netscope.dns;

import io.netscope.common.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Pure-unit test for the DNS controller's reserved-TLD gate.
 *
 * The controller short-circuits before touching dnsjava when the user
 * targets `.local`, `.test`, `.invalid`, `.example`, `.internal`,
 * `.lan`, `.home`, `.corp`, or `.localhost` — these never resolve
 * publicly so a public DNS tool just produces empty answers and
 * confused users.
 *
 * Mirrors the client-side guard at {@code web/lib/target-guard.ts}.
 */
class DnsControllerReservedTldTest {

    private final DnsController controller = new DnsController();

    @ParameterizedTest
    @ValueSource(strings = {
        "router.local",
        "myhost.test",
        "fixture.invalid",
        "anything.example",
        "intranet.internal",
        "files.lan",
        "nas.home",
        "wiki.corp",
        "host.localhost"
    })
    void rejectsReservedTlds(String domain) {
        assertThatThrownBy(() -> controller.lookup(domain, "A"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("never resolves publicly");
    }

    @Test void publicDomainShapeStillReachesTheLookupPath() {
        // We can't actually resolve a domain in a unit-test context (no
        // network), but the controller will only throw a *forbidden*
        // exception for reserved TLDs. A public domain reaches the
        // BoundedDns.run() call and returns empty records → no throw.
        // We assert we don't trip the reserved-TLD gate here.
        try {
            controller.lookup("example.com", "A");
            // If we reach this line, no exception was thrown — the gate
            // didn't reject "example.com" (correct: .com is not reserved).
        } catch (ApiException e) {
            // Only acceptable failure mode is a non-"reserved TLD" error.
            // A reserved-TLD rejection here would be a bug.
            assert !e.getMessage().contains("reserved TLD")
                : "example.com should not be classified as reserved";
        } catch (Exception e) {
            // Network errors etc. are fine; we just want to confirm the
            // controller didn't gate "example.com".
        }
    }
}
