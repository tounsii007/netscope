package io.netscope.dns;

import io.netscope.common.ApiException;
import io.netscope.common.security.DomainNormaliser;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.util.*;
import java.util.concurrent.*;

/**
 * Queries the same record against 15+ public resolvers worldwide. Highlights
 * mismatches so users can see if a DNS change has fully propagated.
 */
@RestController
@RequestMapping("/api/v1/dns-propagation")
public class PropagationController {

    private record Resolver(String name, String region, String ip) {}

    private static final List<Resolver> RESOLVERS = List.of(
        new Resolver("Google", "US",        "8.8.8.8"),
        new Resolver("Google 2", "US",      "8.8.4.4"),
        new Resolver("Cloudflare", "Global","1.1.1.1"),
        new Resolver("Cloudflare 2","Global","1.0.0.1"),
        new Resolver("Quad9", "CH",         "9.9.9.9"),
        new Resolver("OpenDNS", "US",       "208.67.222.222"),
        new Resolver("Level3", "US",        "4.2.2.1"),
        new Resolver("Yandex", "RU",        "77.88.8.8"),
        new Resolver("Comodo", "US",        "8.26.56.26"),
        new Resolver("DNS.WATCH","DE",      "84.200.69.80"),
        new Resolver("Verisign","US",       "64.6.64.6"),
        new Resolver("UncensoredDNS","DK",  "91.239.100.100"),
        new Resolver("CleanBrowsing","US",  "185.228.168.9"),
        new Resolver("AdGuard","CY",        "94.140.14.14"),
        new Resolver("NextDNS","Global",    "45.90.28.0")
    );

    private final ExecutorService exec = Executors.newVirtualThreadPerTaskExecutor();

    @GetMapping("/{domain}")
    public Map<String, Object> check(
            @PathVariable String domain,
            @RequestParam(defaultValue = "A") String type) {
        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }
        Integer recordType = switch (type.toUpperCase()) {
            case "A" -> Type.A; case "AAAA" -> Type.AAAA; case "MX" -> Type.MX;
            case "TXT" -> Type.TXT; case "NS" -> Type.NS; case "CNAME" -> Type.CNAME;
            default -> throw ApiException.badRequest("unsupported type");
        };

        long start = System.currentTimeMillis();
        List<CompletableFuture<Map<String, Object>>> futures = RESOLVERS.stream()
            .map(r -> CompletableFuture.supplyAsync(() -> query(r, domain, recordType, type.toUpperCase()), exec))
            .toList();

        // Hard ceiling on the whole batch — even if every resolver is a tarpit,
        // we return within ~6 s. Per-resolver timeout is 3 s on the resolver
        // itself; this future-level cap is defence in depth.
        List<Map<String, Object>> results = futures.stream()
            .map(f -> {
                try { return f.get(6, TimeUnit.SECONDS); }
                catch (Exception e) {
                    Map<String, Object> err = new LinkedHashMap<>();
                    err.put("ok", false);
                    err.put("error", "timeout");
                    err.put("values", List.of());
                    return err;
                }
            })
            .toList();

        Set<String> unique = new HashSet<>();
        results.forEach(r -> {
            @SuppressWarnings("unchecked")
            List<String> vals = (List<String>) r.get("values");
            if (vals != null) unique.addAll(vals);
        });

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("type", type.toUpperCase());
        out.put("resolverCount", RESOLVERS.size());
        out.put("uniqueAnswers", unique.size());
        out.put("fullyPropagated", unique.size() <= 1 && results.stream().allMatch(r -> (boolean) r.get("ok")));
        out.put("durationMs", System.currentTimeMillis() - start);
        out.put("results", results);
        return out;
    }

    private Map<String, Object> query(Resolver r, String domain, int rt, String typeName) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("resolver", r.name());
        row.put("region", r.region());
        row.put("ip", r.ip());
        long start = System.currentTimeMillis();
        try {
            SimpleResolver sr = new SimpleResolver(r.ip());
            sr.setTimeout(java.time.Duration.ofSeconds(3));
            Lookup lookup = new Lookup(domain, rt);
            lookup.setResolver(sr);
            Record[] recs = lookup.run();
            List<String> values = new ArrayList<>();
            if (recs != null) for (Record rec : recs) values.add(rec.rdataToString());
            row.put("ok", lookup.getResult() == Lookup.SUCCESSFUL);
            row.put("values", values);
            row.put("latencyMs", System.currentTimeMillis() - start);
        } catch (Exception e) {
            row.put("ok", false);
            row.put("error", e.getClass().getSimpleName());
            row.put("latencyMs", System.currentTimeMillis() - start);
        }
        return row;
    }
}
