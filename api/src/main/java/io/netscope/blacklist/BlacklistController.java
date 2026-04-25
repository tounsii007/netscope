package io.netscope.blacklist;

import io.netscope.common.ApiException;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.net.InetAddress;
import java.util.*;
import java.util.concurrent.*;

/**
 * Queries 20+ well-known DNSBLs (Spamhaus, Barracuda, SORBS, ...) by reversing
 * the IP and looking up A records. A result (any) means the IP is listed.
 * Purely DNS-based so no API keys required.
 */
@RestController
@RequestMapping("/api/v1/blacklist")
public class BlacklistController {

    private static final List<String> DNSBLS = List.of(
        "zen.spamhaus.org", "bl.spamcop.net", "b.barracudacentral.org",
        "dnsbl.sorbs.net", "spam.dnsbl.sorbs.net", "web.dnsbl.sorbs.net",
        "cbl.abuseat.org", "dnsbl-1.uceprotect.net", "dnsbl-2.uceprotect.net",
        "dnsbl-3.uceprotect.net", "psbl.surriel.com", "bl.blocklist.de",
        "noptr.spamrats.com", "spam.spamrats.com", "dyna.spamrats.com",
        "ix.dnsbl.manitu.net", "all.s5h.net", "rbl.efnetrbl.org",
        "truncate.gbudb.net", "bl.mailspike.net"
    );

    private final ExecutorService exec = Executors.newVirtualThreadPerTaskExecutor();

    @GetMapping("/{ip}")
    public Map<String, Object> check(@PathVariable String ip) {
        if (!ip.matches("^(\\d{1,3}\\.){3}\\d{1,3}$"))
            throw ApiException.badRequest("only IPv4 supported for DNSBL checks");

        String reversed = reverse(ip);
        long start = System.currentTimeMillis();

        List<CompletableFuture<Map<String, Object>>> futures = DNSBLS.stream()
            .map(bl -> CompletableFuture.supplyAsync(() -> query(bl, reversed), exec))
            .toList();

        List<Map<String, Object>> results = futures.stream().map(CompletableFuture::join).toList();
        long listed = results.stream().filter(r -> Boolean.TRUE.equals(r.get("listed"))).count();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ip", ip);
        out.put("totalChecked", DNSBLS.size());
        out.put("listedCount", listed);
        out.put("clean", listed == 0);
        out.put("reputationScore", (int) Math.round(100.0 * (DNSBLS.size() - listed) / DNSBLS.size()));
        out.put("durationMs", System.currentTimeMillis() - start);
        out.put("results", results);
        return out;
    }

    private String reverse(String ip) {
        String[] parts = ip.split("\\.");
        return parts[3] + "." + parts[2] + "." + parts[1] + "." + parts[0];
    }

    private Map<String, Object> query(String bl, String reversed) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("list", bl);
        try {
            Record[] recs = new Lookup(reversed + "." + bl, Type.A).run();
            if (recs != null && recs.length > 0) {
                r.put("listed", true);
                List<String> codes = new ArrayList<>();
                for (Record rec : recs) codes.add(rec.rdataToString());
                r.put("responseCodes", codes);
            } else {
                r.put("listed", false);
            }
        } catch (Exception e) {
            r.put("listed", false);
            r.put("error", e.getClass().getSimpleName());
        }
        return r;
    }
}
