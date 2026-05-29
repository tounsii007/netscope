package io.netscope.doh;

import io.netscope.common.ApiException;
import io.netscope.common.security.DomainNormaliser;
import io.netscope.common.ToolMetrics;
import io.netscope.doh.DohResolverDirectory.ResolverSpec;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.Type;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * DNS-over-HTTPS / DNS-over-TLS tester. Resolves one (name, type) tuple
 * against the five providers listed in {@link DohResolverDirectory} in
 * parallel, then assembles a consistency view across them.
 *
 * Substantive logic delegated to:
 *   • {@link DohResolverDirectory} — the catalogue of providers
 *   • {@link DohResolverProbe}     — a single DoH lookup
 *   • {@link DotReachability}      — the TCP/853 port check
 *
 * This controller owns the parallel-fan-out orchestration and the
 * cross-resolver consistency check.
 */
@RestController
@RequestMapping("/api/v1/doh")
public class DohController {

    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(4);
    private static final Duration TOTAL_BUDGET = Duration.ofSeconds(8);

    private final ExecutorService pool;
    private final ToolMetrics metrics;

    public DohController(@Qualifier("dohProbeExecutor") ExecutorService dohProbeExecutor,
                         ToolMetrics metrics) {
        this.pool = dohProbeExecutor;
        this.metrics = metrics;
    }

    @GetMapping("/{domain}")
    public Map<String, Object> probe(
            @PathVariable String domain,
            @RequestParam(defaultValue = "A") String type) {
        return metrics.record("doh", "probe", () -> probeInternal(domain, type));
    }

    private Map<String, Object> probeInternal(String domain, String type) {
        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9._-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }
        int recordType = parseType(type);

        long start = System.currentTimeMillis();
        List<Future<Map<String, Object>>> futures = new ArrayList<>();
        for (ResolverSpec r : DohResolverDirectory.ALL) {
            String domainCapture = domain;
            futures.add(pool.submit(() -> probeOne(r, domainCapture, recordType)));
        }

        List<Map<String, Object>> perResolver = new ArrayList<>();
        for (Future<Map<String, Object>> f : futures) {
            try { perResolver.add(f.get(TOTAL_BUDGET.toMillis(), TimeUnit.MILLISECONDS)); }
            catch (Exception ignored) { /* one slow resolver doesn't sink the rest */ }
        }

        Set<String> answerSets = collectDistinctAnswerSets(perResolver);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("type", type.toUpperCase());
        out.put("totalDurationMs", System.currentTimeMillis() - start);
        out.put("resolvers", perResolver);
        out.put("consistent", answerSets.size() <= 1);
        out.put("distinctAnswerSets", answerSets.size());
        return out;
    }

    private static Map<String, Object> probeOne(ResolverSpec spec, String domain, int recordType) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("name", spec.name());
        r.put("dohEndpoint", spec.dohUrl());
        r.put("dotHost", spec.dotHost());

        DohResolverProbe.Result doh = DohResolverProbe.query(
            spec.dohUrl(), domain, recordType, PROBE_TIMEOUT);
        r.put("doh", doh.doh());
        r.put("answers", doh.answers());
        r.put("dot", DotReachability.probe(spec.dotHost(), PROBE_TIMEOUT));
        return r;
    }

    private static Set<String> collectDistinctAnswerSets(List<Map<String, Object>> perResolver) {
        Set<String> answerSets = new LinkedHashSet<>();
        for (Map<String, Object> r : perResolver) {
            @SuppressWarnings("unchecked")
            List<String> answers = (List<String>) r.get("answers");
            if (answers != null && !answers.isEmpty()) {
                List<String> sorted = new ArrayList<>(answers);
                Collections.sort(sorted);
                answerSets.add(String.join("|", sorted));
            }
        }
        return answerSets;
    }

    private static int parseType(String t) {
        return switch (t.trim().toUpperCase()) {
            case "A"     -> Type.A;
            case "AAAA"  -> Type.AAAA;
            case "MX"    -> Type.MX;
            case "TXT"   -> Type.TXT;
            case "NS"    -> Type.NS;
            case "CNAME" -> Type.CNAME;
            case "SOA"   -> Type.SOA;
            case "CAA"   -> Type.CAA;
            default -> throw ApiException.badRequest("unsupported DNS record type: " + t);
        };
    }
}
