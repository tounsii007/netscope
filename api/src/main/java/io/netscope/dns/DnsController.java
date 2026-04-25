package io.netscope.dns;

import io.netscope.common.ApiException;
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

    @GetMapping("/{domain}")
    public Map<String, Object> lookup(
            @PathVariable String domain,
            @RequestParam(defaultValue = "A,AAAA,MX,TXT,NS") String type) {

        if (!domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }

        Map<String, List<String>> records = new LinkedHashMap<>();
        long start = System.currentTimeMillis();

        for (String t : type.toUpperCase().split(",")) {
            t = t.trim();
            Integer rt = TYPES.get(t);
            if (rt == null) continue;
            List<String> values = new ArrayList<>();
            try {
                Record[] result = new Lookup(domain, rt).run();
                if (result != null) {
                    for (Record r : result) values.add(r.rdataToString());
                }
            } catch (TextParseException e) {
                throw ApiException.badRequest("bad domain: " + domain);
            }
            records.put(t, values);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("records", records);
        out.put("durationMs", System.currentTimeMillis() - start);
        return out;
    }
}
