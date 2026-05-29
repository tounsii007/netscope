package io.netscope.dns;

import io.netscope.common.ApiException;
import io.netscope.common.BoundedDns;
import io.netscope.common.DomainNormaliser;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.util.*;

/**
 * Checks DNSSEC deployment for a domain: DS record at parent, DNSKEY at zone,
 * and whether signatures (RRSIG) are present. Not a full validating resolver —
 * a proper chain check would need dnsjava's DnssecValidator with a trust anchor.
 */
@RestController
@RequestMapping("/api/v1/dnssec")
public class DnssecController {

    @GetMapping("/{domain}")
    public Map<String, Object> check(@PathVariable String domain) {
        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);

        List<Map<String, Object>> dsRecords = queryDs(domain);
        List<Map<String, Object>> keys = queryDnskey(domain);
        boolean hasRrsig = hasRrsig(domain);

        out.put("dsRecords", dsRecords);
        out.put("dnskeyRecords", keys);
        out.put("hasRrsig", hasRrsig);

        boolean signed = !dsRecords.isEmpty() && !keys.isEmpty() && hasRrsig;
        out.put("signed", signed);

        List<String> warnings = new ArrayList<>();
        if (dsRecords.isEmpty()) warnings.add("No DS record at parent — DNSSEC not published to registry");
        if (keys.isEmpty()) warnings.add("No DNSKEY records — zone is not signed");
        if (!hasRrsig) warnings.add("No RRSIG on A record — responses are not signed");
        if (signed) warnings.add("DNSSEC appears fully deployed. Validate with a DNSSEC-aware resolver to confirm chain.");
        out.put("warnings", warnings);

        return out;
    }

    private List<Map<String, Object>> queryDs(String domain) {
        try {
            Record[] recs = BoundedDns.run(domain, Type.DS);
            if (recs == null) return List.of();
            List<Map<String, Object>> out = new ArrayList<>();
            for (Record r : recs) if (r instanceof DSRecord ds) {
                out.add(Map.of("keyTag", ds.getFootprint(), "algorithm", ds.getAlgorithm(),
                    "digestType", ds.getDigestID(), "digest", bytesHex(ds.getDigest())));
            }
            return out;
        } catch (Exception e) { return List.of(); }
    }

    private List<Map<String, Object>> queryDnskey(String domain) {
        try {
            Record[] recs = BoundedDns.run(domain, Type.DNSKEY);
            if (recs == null) return List.of();
            List<Map<String, Object>> out = new ArrayList<>();
            for (Record r : recs) if (r instanceof DNSKEYRecord k) {
                out.add(Map.of("keyTag", k.getFootprint(), "algorithm", k.getAlgorithm(),
                    "flags", k.getFlags(), "protocol", k.getProtocol(),
                    "ksk", (k.getFlags() & 0x0001) != 0));
            }
            return out;
        } catch (Exception e) { return List.of(); }
    }

    private boolean hasRrsig(String domain) {
        try {
            // EDNS DO flag is required for the resolver to return RRSIGs;
            // we route through BoundedDns(custom-resolver) so the lookup
            // still has the 3 s cap.
            SimpleResolver r = new SimpleResolver("1.1.1.1");
            r.setEDNS(0, 4096, ExtendedFlags.DO, List.of());
            Record[] recs = BoundedDns.run(domain, Type.A, r);
            if (recs == null) return false;
            for (Record rec : recs) if (rec instanceof RRSIGRecord) return true;
            return false;
        } catch (Exception e) { return false; }
    }

    private String bytesHex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
