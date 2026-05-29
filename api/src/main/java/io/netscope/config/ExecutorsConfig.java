package io.netscope.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;

/**
 * Bulkhead pattern: each class of work gets its own virtual-thread executor.
 * Saturation in one area (e.g. slow port scans) cannot starve DNS queries or
 * scheduled monitor checks. Virtual threads make per-pool cost negligible.
 */
@Configuration
public class ExecutorsConfig {

    @Bean(destroyMethod = "shutdown") public ExecutorService portScanExecutor() { return build("portscan"); }
    @Bean(destroyMethod = "shutdown") public ExecutorService dnsExecutor()      { return build("dns"); }
    @Bean(destroyMethod = "shutdown") public ExecutorService monitorExecutor()  { return build("monitor"); }
    @Bean(destroyMethod = "shutdown") public ExecutorService externalHttpExecutor() { return build("ext-http"); }
    // DKIM and DoH probes each fan out a small bounded set of DNS queries
    // (≤13 selectors / 5 resolvers). Keeping them on their own pools
    // makes the bulkheading observable in JFR thread dumps and prevents
    // a slow DNS upstream in one tool from blocking the other.
    @Bean(destroyMethod = "shutdown") public ExecutorService dkimProbeExecutor() { return build("dkim-probe"); }
    @Bean(destroyMethod = "shutdown") public ExecutorService dohProbeExecutor()  { return build("doh-probe"); }

    private ExecutorService build(String name) {
        return java.util.concurrent.Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("ns-" + name + "-", 0).factory());
    }
}
