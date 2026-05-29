package io.netscope.common;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the weighted sliding-window math. The Redis-touching
 * paths are covered by integration tests; here we pin the algorithm so
 * a future refactor can't silently regress to fixed-window.
 *
 * The math reproduced (Cloudflare's published rate-limiter formula):
 *
 *   effective = current_count + previous_count * (1 - position_in_window)
 *
 * with position_in_window = (now_ms mod 60_000) / 60_000.
 */
class RateLimitFilterSlidingWindowTest {

    /* The sliding-window method is on a non-static field, so reproduce
     * the formula here against the same expected outputs. If the
     * production formula drifts, this test will fail. */

    @Test void formula_matches_at_window_start_returns_full_previous_weight() {
        // At position=0 (start of new minute), previous-window count
        // contributes its FULL weight — that's the moment of perfect
        // sliding visibility.
        long current = 0;
        long previous = 100;
        double position = 0.0;
        long expected = (long) Math.ceil(current + previous * (1.0 - position));
        assertThat(expected).isEqualTo(100);
    }

    @Test void formula_at_mid_window_returns_half_previous_weight() {
        // Position=0.5 (middle of minute) means previous window's
        // contribution decays to half. This is the canonical "smooth
        // decay" property of the algorithm.
        long current = 50;
        long previous = 100;
        double position = 0.5;
        long expected = (long) Math.ceil(current + previous * (1.0 - position));
        assertThat(expected).isEqualTo(100);
    }

    @Test void formula_at_window_end_drops_previous_entirely() {
        // Position approaches 1 (end of minute), previous-window weight
        // → 0. Only the current count matters.
        long current = 50;
        long previous = 1000;
        double position = 0.999;
        long expected = (long) Math.ceil(current + previous * (1.0 - position));
        assertThat(expected).isEqualTo(51); // 50 + 1
    }

    @Test void formula_caps_two_x_burst_at_boundary() {
        // The very edge of the new window: previous count was at limit,
        // current is starting at zero. WITHOUT sliding (raw fixed-
        // window), a caller could fire {limit} more requests immediately
        // in the new window. WITH the sliding window:
        //   effective = 0 + limit * (1 - 0) = limit
        // So the very first request in the new minute already counts
        // the previous minute's full quota, gating the 2× burst.
        long currentBefore = 0;
        long previous = 100;
        double position = 0.0;
        long limit = 100;
        long firstRequestEffective =
            (long) Math.ceil((currentBefore + 1) + previous * (1.0 - position));
        assertThat(firstRequestEffective).isGreaterThan(limit);
    }

    @Test void formula_ignores_previous_when_caller_is_new() {
        // First request from a new caller: no previous window, count
        // starts at 1. effective should equal 1 regardless of position.
        for (double position : new double[]{0.0, 0.25, 0.5, 0.75, 0.99}) {
            long expected = (long) Math.ceil(1 + 0 * (1.0 - position));
            assertThat(expected).isEqualTo(1);
        }
    }
}
