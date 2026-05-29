package io.netscope.doh;

import io.netscope.common.ApiException;
import io.netscope.common.BoundedDns;
import io.netscope.common.DomainNormaliser;
import io.netscope.common.ToolMetrics;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

/**
 * DNS-over-HTTPS / DNS-over-TLS resolver tester.
 *
 * Resolves a single (name, type) tuple against five public encrypted-DNS
 * providers in parallel — Cloudflare, Google, Quad9, AdGuard and NextDNS —
 * and returns each resolver's verbatim answer, latency and a consistency
 * check across the providers. Useful for:
 *
 *   • Confirming a domain resolves identically across the public encrypted-
 *     DNS landscape — split-horizon DNS or geo-targeted answers stand out.
 *   • Diagnosing whether a DoH/DoT outage is provider-side or local.
 *   • Verifying that a recursive resolver under test can in fact be reached
 *     over TLS on port 853 (DoT reachability check).
 *
 * Trade-off vs the existing /dns-propagation tool: that one fans out across
 * 15+ classic UDP recursors to surface caching artefacts; this one focuses
 * on encrypted transports + a per-provider answer comparison.
 */
@RestController
@RequestMapping("/api/v1/doh")
public class DohController {

    /** Per-query budget. Each DoH probe runs inside this cap; we then sum
     *  via the global executor's await with a slightly larger ceiling. */
    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(4);
    /** Whole-request budget. Even with 5 resolvers in parallel we never
     *  hold the connection longer than this. */
    private static final Duration TOTAL_BUDGET = Duration.ofSeconds(8);
    /** Default DoT port — RFC 7858. */
    private static final int DOT_PORT = 853;

    private static final List<ResolverSpec> RESOLVERS = List.of(
        new ResolverSpec("cloudflare", "https://cloudflare-dns.com/dns-query", "1.1.1.1"),
        new ResolverSpec("google",     "https://dns.google/dns-query",        "8.8.8.8"),
        new ResolverSpec("quad9",      "https://dns.quad9.net/dns-query",     "9.9.9.9"),
        new ResolverSpec("adguard",    "https://dns.adguard-dns.com/dns-query", "94.140.14.14"),
        new ResolverSpec("nextdns",    "https://dns.nextdns.io",              "45.90.28.165")
    );

    /** Injected from {@link io.netscope.config.ExecutorsConfig#dohProbeExecutor}
     *  so the executor is drained on Spring shutdown rather than leaked
     *  at JVM exit. */
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

        // IDN canonicalisation before the ASCII regex. See
        // DomainNormaliser for the strictness policy.
        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9._-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }
        int recordType = parseType(type);

        long start = System.currentTimeMillis();
        List<Future<Map<String, Object>>> futures = new ArrayList<>();
        for (ResolverSpec r : RESOLVERS) {
            futures.add(pool.submit(() -> probeOne(r, domain, recordType)));
        }

        List<Map<String, Object>> perResolver = new ArrayList<>();
        for (Future<Map<String, Object>> f : futures) {
            try { perResolver.add(f.get(TOTAL_BUDGET.toMillis(), TimeUnit.MILLISECONDS)); }
            catch (Exception ignored) { /* one slow resolver doesn't sink the rest */ }
        }

        // Consistency check: every reachable resolver must return the same
        // sorted, normalised answer set. If anyone diverges, flag it.
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

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("type", type.toUpperCase());
        out.put("totalDurationMs", System.currentTimeMillis() - start);
        out.put("resolvers", perResolver);
        out.put("consistent", answerSets.size() <= 1);
        out.put("distinctAnswerSets", answerSets.size());
        return out;
    }

    private Map<String, Object> probeOne(ResolverSpec spec, String domain, int recordType) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("name", spec.name());
        r.put("dohEndpoint", spec.dohUrl());
        r.put("dotHost", spec.dotHost());

        // ── DoH query ────────────────────────────────────────────────────
        long t0 = System.currentTimeMillis();
        try {
            DohResolver resolver = new DohResolver(spec.dohUrl());
            resolver.setTimeout(PROBE_TIMEOUT);
            // dnsjava's DohResolver internally pools an HttpClient; we still
            // wrap in BoundedDns for the outer barrier guarantee.
            Record[] records = BoundedDns.run(domain, recordType, resolver);
            long elapsed = System.currentTimeMillis() - t0;
            r.put("doh", Map.of(
                "ok", records != null,
                "latencyMs", elapsed,
                "answerCount", records == null ? 0 : records.length
            ));
            if (records != null) {
                List<String> answers = new ArrayList<>();
                for (Record rec : records) answers.add(rec.rdataToString());
                r.put("answers", answers);
            } else {
                r.put("answers", List.of());
            }
        } catch (Exception e) {
            r.put("doh", Map.of(
                "ok", false,
                "latencyMs", System.currentTimeMillis() - t0,
                "error", e.getClass().getSimpleName()
            ));
            r.put("answers", List.of());
        }

        // ── DoT port-reachability probe ──────────────────────────────────
        // We don't actually run a TLS handshake here — surfacing port-open
        // status is enough to tell the user whether their network blocks
        // outbound 853. A real TLS-handshake test would belong in a
        // separate probe with cert-chain inspection.
        long t1 = System.currentTimeMillis();
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(spec.dotHost(), DOT_PORT),
                (int) PROBE_TIMEOUT.toMillis());
            r.put("dot", Map.of(
                "reachable", true,
                "port", DOT_PORT,
                "latencyMs", System.currentTimeMillis() - t1
            ));
        } catch (Exception e) {
            r.put("dot", Map.of(
                "reachable", false,
                "port", DOT_PORT,
                "latencyMs", System.currentTimeMillis() - t1,
                "error", e.getClass().getSimpleName()
            ));
        }

        return r;
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

    /** Bundles a provider's DoH URL with its corresponding DoT IP address. */
    private record ResolverSpec(String name, String dohUrl, String dotHost) {
        // Validate at construction so a misconfigured static list fails at
        // class-load rather than first-request.
        ResolverSpec {
            Objects.requireNonNull(name); Objects.requireNonNull(dohUrl);
            URI.create(dohUrl); // throws if malformed
        }
    }
}
