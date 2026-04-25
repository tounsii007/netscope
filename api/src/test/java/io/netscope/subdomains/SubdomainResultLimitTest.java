package io.netscope.subdomains;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the static result-cap constants exist and are sane.
 *
 * The {@link SubdomainController} fetches CT logs for a domain. Without a
 * cap, popular domains (example.com, google.com) can return 100k+ certs
 * which would balloon heap (50+ MB), serialise to a 50+ MB JSON response,
 * and inflate Redis cache entries past their max-value size.
 *
 * The full integration behaviour is exercised by the matching IT test
 * (which runs against a real crt.sh stub via WireMock); this unit test
 * just locks the constants in place so a future refactor can't silently
 * remove them.
 */
class SubdomainResultLimitTest {

    @Test void MAX_SUBDOMAINS_constant_is_present_and_reasonable() {
        assertThat(SubdomainController.MAX_SUBDOMAINS)
            .as("MAX_SUBDOMAINS must be a sane upper bound")
            .isBetween(1_000, 100_000);
    }

    @Test void MAX_RESPONSE_BYTES_constant_is_present_and_reasonable() {
        assertThat(SubdomainController.MAX_RESPONSE_BYTES)
            .as("MAX_RESPONSE_BYTES must cap the upstream body")
            .isBetween(1024L * 1024, 64L * 1024 * 1024);   // 1 MB ... 64 MB
    }
}
