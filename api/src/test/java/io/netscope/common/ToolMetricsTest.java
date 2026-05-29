package io.netscope.common;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ToolMetricsTest {

    private final MeterRegistry registry = new SimpleMeterRegistry();
    private final ToolMetrics metrics = new ToolMetrics(registry);

    @Test void records_ok_outcome_when_block_returns_normally() {
        String r = metrics.record("dns", "lookup", () -> "result");
        assertThat(r).isEqualTo("result");

        // Counter and timer tagged outcome="ok" must both increment.
        assertThat(registry.counter("netscope.tool.calls",
            "tool", "dns", "op", "lookup", "outcome", "ok").count()).isEqualTo(1.0);
        assertThat(registry.timer("netscope.tool.latency",
            "tool", "dns", "op", "lookup", "outcome", "ok").count()).isEqualTo(1);
    }

    @Test void records_err_outcome_when_block_throws_and_rethrows() {
        // The exception must propagate AND the counter must reflect err.
        assertThatThrownBy(() ->
            metrics.record("dns", "lookup", () -> {
                throw new RuntimeException("boom");
            })
        ).isInstanceOf(RuntimeException.class).hasMessage("boom");

        assertThat(registry.counter("netscope.tool.calls",
            "tool", "dns", "op", "lookup", "outcome", "err").count()).isEqualTo(1.0);
        // Latency series for the err case must also be recorded so
        // dashboards can compare ok-vs-err timing at a glance.
        assertThat(registry.timer("netscope.tool.latency",
            "tool", "dns", "op", "lookup", "outcome", "err").count()).isEqualTo(1);
    }

    @Test void recordVoid_accepts_runnable_and_increments_counter() {
        metrics.recordVoid("dns", "lookup", () -> { /* no-op */ });

        assertThat(registry.counter("netscope.tool.calls",
            "tool", "dns", "op", "lookup", "outcome", "ok").count()).isEqualTo(1.0);
    }

    @Test void distinct_tool_op_pairs_get_distinct_series() {
        metrics.record("dns", "lookup", () -> null);
        metrics.record("dns", "propagation", () -> null);
        metrics.record("dkim", "lookup", () -> null);

        // Cardinality stays bounded: three distinct counter series.
        assertThat(registry.counter("netscope.tool.calls",
            "tool", "dns", "op", "lookup", "outcome", "ok").count()).isEqualTo(1.0);
        assertThat(registry.counter("netscope.tool.calls",
            "tool", "dns", "op", "propagation", "outcome", "ok").count()).isEqualTo(1.0);
        assertThat(registry.counter("netscope.tool.calls",
            "tool", "dkim", "op", "lookup", "outcome", "ok").count()).isEqualTo(1.0);
    }
}
