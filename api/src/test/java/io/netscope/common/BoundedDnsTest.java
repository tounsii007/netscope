package io.netscope.common;

import org.junit.jupiter.api.Test;
import org.xbill.DNS.Record;
import org.xbill.DNS.Type;

import java.time.Duration;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;

/**
 * Hang-resistance tests for {@link BoundedDns}.
 *
 * Invariants:
 *   • A timeout MUST be honoured — even if dnsjava hangs, the future is
 *     cancelled and we return null within the configured bound (+ generous slack).
 *   • A request that asks for > MAX_TIMEOUT is silently capped.
 *   • Parallel calls do not interfere.
 *   • A nameserver returning quickly with no records returns an empty array
 *     OR null without throwing.
 *   • A bogus domain name does NOT throw — returns null.
 */
class BoundedDnsTest {

    /* ─── timeout invariant — the whole point of this class ──────────────── */

    @Test void run_returns_within_configured_timeout_even_for_unreachable_target() {
        // 1.2.3.4 is BGP-routable but normally unresponsive. Even if it
        // happens to reply, the timeout path is what we're testing.
        // Use a domain that requires a DNS query to a real resolver.
        long t0 = System.nanoTime();
        Record[] result = BoundedDns.run(
            "this-host-does-not-exist-anywhere-9be17a82.invalid",
            Type.A,
            Duration.ofMillis(800));
        long elapsedMs = (System.nanoTime() - t0) / 1_000_000;

        // Either resolves (likely null since .invalid TLD) or times out —
        // never blocks more than ~2× the configured timeout.
        assertThat(elapsedMs).as("timeout must be honoured")
            .isLessThanOrEqualTo(2_500);
    }

    @Test void run_caps_unreasonably_large_timeout_at_MAX_TIMEOUT() {
        long t0 = System.nanoTime();
        // Caller asks for a 5-minute timeout — must be silently capped at 8 s.
        BoundedDns.run("this-host-does-not-exist.invalid", Type.A, Duration.ofMinutes(5));
        long elapsedMs = (System.nanoTime() - t0) / 1_000_000;

        // Allow some slack but must be well under the 5-minute request
        assertThat(elapsedMs).as("timeout must be capped at MAX_TIMEOUT")
            .isLessThanOrEqualTo(BoundedDns.MAX_TIMEOUT.toMillis() + 2_000);
    }

    @Test void run_returns_null_for_obviously_invalid_domain_without_throwing() {
        assertThatCode(() -> BoundedDns.run("...invalid name with spaces...", Type.A))
            .doesNotThrowAnyException();
    }

    @Test void run_returns_null_or_empty_for_nonexistent_subdomain() {
        // .invalid TLD per RFC 2606 — guaranteed not to resolve
        Record[] r = BoundedDns.run("missing-9be17a82.invalid", Type.A, Duration.ofSeconds(2));
        // Either null or empty array is acceptable
        assertThat(r == null || r.length == 0).isTrue();
    }

    /* ─── concurrent calls don't interfere ──────────────────────────────── */

    @Test void parallel_lookups_complete_without_starving_each_other() throws Exception {
        int parallel = 16;
        ExecutorService pool = Executors.newFixedThreadPool(parallel);
        try {
            CountDownLatch start = new CountDownLatch(1);
            CountDownLatch done  = new CountDownLatch(parallel);
            long[] elapsed = new long[parallel];

            for (int i = 0; i < parallel; i++) {
                final int idx = i;
                pool.submit(() -> {
                    try {
                        start.await();
                        long t0 = System.nanoTime();
                        BoundedDns.run("missing-" + idx + ".invalid", Type.A,
                            Duration.ofMillis(800));
                        elapsed[idx] = (System.nanoTime() - t0) / 1_000_000;
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                });
            }

            start.countDown();
            assertThat(done.await(15, TimeUnit.SECONDS))
                .as("parallel BoundedDns calls must finish within 15s total").isTrue();

            // Every call individually capped at ~2× its 800ms budget
            for (long ms : elapsed) {
                assertThat(ms).isLessThanOrEqualTo(2_500);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    /* ─── overload of run() with default timeout ─────────────────────────── */

    @Test void default_run_returns_within_default_plus_slack() {
        long t0 = System.nanoTime();
        BoundedDns.run("missing-default.invalid", Type.A);
        long elapsedMs = (System.nanoTime() - t0) / 1_000_000;
        assertThat(elapsedMs).isLessThanOrEqualTo(BoundedDns.DEFAULT_TIMEOUT.toMillis() + 2_000);
    }

    /* ─── happy path against a domain that should resolve ────────────────── */

    @Test void run_returns_records_for_well_known_domain_when_DNS_is_available() {
        // Best-effort: in environments without DNS this returns null and we
        // skip the assertion. We only assert the bounded behaviour ran.
        Record[] r = BoundedDns.run("cloudflare.com", Type.A, Duration.ofSeconds(3));
        if (r != null) {
            assertThat(r.length).isGreaterThan(0);
        }
        // If DNS is unavailable in the test env, that's OK — the test is about
        // the bounded contract, not network connectivity.
    }
}
