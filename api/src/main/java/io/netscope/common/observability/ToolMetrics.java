package io.netscope.common.observability;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

/**
 * Per-tool counter + latency timer facade.
 *
 * Every tool endpoint wraps its work in {@code metrics.record("dns",
 * "lookup", () -> ...)}. This produces:
 *
 *   • {@code netscope_tool_calls_total{tool="dns",op="lookup",outcome="ok|err"}}
 *     — a counter that distinguishes successful from failed invocations.
 *   • {@code netscope_tool_latency_seconds{tool="dns",op="lookup",outcome="..."}}
 *     — a histogram giving p50/p95/p99 latencies per tool/op/outcome.
 *
 * Prometheus scrapes these via {@code /actuator/prometheus} (already
 * wired by the spring-boot-actuator + micrometer-registry-prometheus
 * dependencies). Grafana dashboards and alerts can be defined directly
 * against the {@code netscope_tool_*} family without further plumbing.
 *
 * Why a single facade instead of per-tool counter declarations: keeps
 * tag cardinality bounded ({@code tool} + {@code op} + {@code outcome}
 * = ~3 × 5 × 2 = 30 series per tool family), and gives a single place
 * to add new dimensions (e.g. customer-plan, region) when needed.
 */
@Component
public class ToolMetrics {

    private final MeterRegistry registry;

    public ToolMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    /**
     * Record a tool invocation. Times the block, increments the
     * appropriate counter, re-throws any RuntimeException so the
     * controller's exception path is untouched.
     *
     * @param tool short tool name (e.g. {@code "dns"}, {@code "dkim"}).
     *             Stable, low cardinality.
     * @param op   operation within the tool (e.g. {@code "lookup"},
     *             {@code "propagation"}). Stable, low cardinality.
     */
    public <T> T record(String tool, String op, ThrowingSupplier<T> work) {
        Timer.Sample sample = Timer.start(registry);
        String outcome = "ok";
        try {
            return work.get();
        } catch (RuntimeException e) {
            outcome = "err";
            throw e;
        } finally {
            Tags tags = Tags.of("tool", tool, "op", op, "outcome", outcome);
            sample.stop(registry.timer("netscope.tool.latency", tags));
            registry.counter("netscope.tool.calls", tags).increment();
        }
    }

    /** Variant for void operations. */
    public void recordVoid(String tool, String op, ThrowingRunnable work) {
        record(tool, op, () -> { work.run(); return null; });
    }

    @FunctionalInterface
    public interface ThrowingSupplier<T> {
        T get();
    }

    @FunctionalInterface
    public interface ThrowingRunnable {
        void run();
    }
}
