package io.netscope.dns;

import io.netscope.common.ApiException;
import io.netscope.common.BoundedDns;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.util.*;

@RestController
@RequestMapping("/api/v1/dns")
public class DnsController {

    private static final Map<String, Integer> TYPES = Map.of(
        "A", Type.A, "AAAA", Type.AAAA, "MX", Type.MX, "TXT", Type.TXT,
        "CNAME", Type.CNAME, "NS", Type.NS, "SOA", Type.SOA, "CAA", Type.CAA
    );

    /**
     * Lookup endpoint. Backwards-compatible: every existing client keeps
     * receiving `records` as a `Map<type, List<value>>`. The new
     * `recordsDetailed` map carries the full record metadata — TTL,
     * DNS class, name, and (for MX) the parsed preference — for UI
     * components that want to render that information without re-parsing
     * `rdataToString()` on the client.
     */
    @GetMapping("/{domain}")
    public Map<String, Object> lookup(
            @PathVariable String domain,
            @RequestParam(defaultValue = "A,AAAA,MX,TXT,NS") String type) {

        if (!domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }

        // Reject the same reserved-TLD set the client-side guard rejects
        // — diagnosing .local / .test / .invalid on a public tool is
        // pointless and just produces empty answers.
        String lower = domain.toLowerCase();
        int dotIdx = lower.lastIndexOf('.');
        if (dotIdx > 0) {
            String tld = lower.substring(dotIdx + 1);
            if (RESERVED_TLDS.contains(tld)) {
                throw ApiException.forbidden("reserved TLD '" + tld + "' never resolves publicly");
            }
        }

        Map<String, List<String>> records = new LinkedHashMap<>();
        Map<String, List<Map<String, Object>>> recordsDetailed = new LinkedHashMap<>();
        long start = System.currentTimeMillis();

        for (String t : type.toUpperCase().split(",")) {
            t = t.trim();
            Integer rt = TYPES.get(t);
            if (rt == null) continue;
            List<String> values = new ArrayList<>();
            List<Map<String, Object>> detailed = new ArrayList<>();
            // Bounded — never blocks more than ~3 s per record type even if the
            // remote nameserver is a tarpit. Returns null on timeout/error.
            Record[] result = BoundedDns.run(domain, rt);
            if (result != null) {
                for (Record r : result) {
                    String rdata = r.rdataToString();
                    values.add(rdata);
                    detailed.add(detailOf(r, rdata));
                }
            }
            records.put(t, values);
            recordsDetailed.put(t, detailed);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("records", records);
        out.put("recordsDetailed", recordsDetailed);
        out.put("durationMs", System.currentTimeMillis() - start);
        return out;
    }

    /**
     * Per-record metadata. We always emit `value` (the rdata string),
     * `ttl` (seconds), `dnsClass` ("IN" for the public Internet); MX
     * records additionally carry the numeric `preference` parsed out so
     * the UI can sort and label the priority instead of showing the
     * combined "10 mx.example.com." string.
     */
    private static Map<String, Object> detailOf(Record r, String rdata) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("value", rdata);
        m.put("ttl", r.getTTL());
        m.put("dnsClass", DClass.string(r.getDClass()));
        if (r instanceof MXRecord mx) {
            m.put("preference", mx.getPriority());
            m.put("exchange", mx.getTarget().toString(true));
        } else if (r instanceof SOARecord soa) {
            m.put("primaryNs", soa.getHost().toString(true));
            m.put("adminEmail", soa.getAdmin().toString(true));
            m.put("serial", soa.getSerial());
            m.put("refresh", soa.getRefresh());
            m.put("retry", soa.getRetry());
            m.put("expire", soa.getExpire());
            m.put("minimum", soa.getMinimum());
        } else if (r instanceof CAARecord caa) {
            m.put("flags", caa.getFlags());
            m.put("tag", caa.getTag());
            m.put("caaValue", caa.getValue());
        }
        return m;
    }

    /**
     * Reserved TLDs the public DNS lookup must never query — RFC 6761
     * sentinel zones plus the de-facto enterprise / home-router
     * conventions. Mirrors the client-side guard (`web/lib/target-guard.ts`).
     */
    private static final Set<String> RESERVED_TLDS = Set.of(
        "local", "localhost", "test", "invalid", "example",
        "internal", "lan", "home", "corp"
    );
}
