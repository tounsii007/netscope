package io.netscope.subdomains;

import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the degraded JSON payload returned by the Resilience4j
 * circuit-breaker fallback when both CT sources fail.
 *
 * <p>Two responsibilities, deliberately kept together because they
 * both run only when the breaker fires:
 *
 *   • Walk the cause chain and log every layer. Spring + Resilience4j
 *     wrap the real exception multiple times, so the surface message
 *     is useless without unrolling — that diagnostic is the one chance
 *     to learn why both sources failed.
 *   • Distinguish breaker-OPEN (no upstream call was made) from a real
 *     failure that just-tripped the breaker, because the operator
 *     remediation is different.
 *
 * <p>The shape of the response is fixed for the frontend's degraded-mode
 * banner: {@code degraded: true}, empty {@code subdomains} list,
 * non-error HTTP status. Changing keys here is a breaking change.
 */
final class SubdomainFallbackResponse {

    private static final Logger log = LoggerFactory.getLogger(SubdomainFallbackResponse.class);

    private SubdomainFallbackResponse() {}

    static Map<String, Object> build(String domain, Throwable t) {
        log.error("[crtsh] !!! FALLBACK triggered for domain='{}'", domain);
        Throwable cur = t;
        int depth = 0;
        while (cur != null && depth < 8) {
            log.error("[crtsh] fallback cause [depth={}]: {} - {}",
                depth, cur.getClass().getName(), cur.getMessage());
            cur = cur.getCause();
            depth++;
        }
        log.error("[crtsh] fallback full stacktrace:", t);

        if (t instanceof CallNotPermittedException) {
            log.warn("[crtsh] circuit breaker is OPEN — request was NOT sent to crt.sh. " +
                "Wait for the breaker to half-open (default 60s) or restart the backend.");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("degraded", true);
        out.put("message", "CT log provider unavailable, try again in a minute");
        out.put("subdomains", List.of());
        out.put("count", 0);
        out.put("truncated", false);
        return out;
    }
}
