package io.netscope.dns;

import io.netscope.common.ApiException;
import io.netscope.common.BoundedDns;
import io.netscope.common.DomainNormaliser;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.util.*;

/**
 * DNS lookup HTTP boundary. The substantive logic lives in:
 *
 *   • {@link DnsRecordDescriber} — per-record-type detail extraction
 *   • {@link DnsRrsigSummary}    — RRSIG-row reduction
 *   • {@link DnssecChainSummary} — DS + DNSKEY presence + algorithm list
 *
 * This controller validates the input, walks the requested record
 * types, optionally pairs each type with its RRSIG, and assembles the
 * response envelope.
 */
@RestController
@RequestMapping("/api/v1/dns")
public class DnsController {

    /** Record types this endpoint will resolve. Extends the "basic"
     *  set to cover SRV (service discovery), TLSA (DANE), SVCB/HTTPS
     *  (RFC 9460), DS/DNSKEY/RRSIG/NSEC/NSEC3 (DNSSEC), CDS/CDNSKEY. */
    private static final Map<String, Integer> TYPES = Map.ofEntries(
        Map.entry("A", Type.A), Map.entry("AAAA", Type.AAAA),
        Map.entry("MX", Type.MX), Map.entry("TXT", Type.TXT),
        Map.entry("CNAME", Type.CNAME), Map.entry("NS", Type.NS),
        Map.entry("SOA", Type.SOA), Map.entry("CAA", Type.CAA),
        Map.entry("SRV", Type.SRV), Map.entry("PTR", Type.PTR),
        Map.entry("TLSA", Type.TLSA),
        Map.entry("SVCB", Type.SVCB), Map.entry("HTTPS", Type.HTTPS),
        Map.entry("DS", Type.DS), Map.entry("DNSKEY", Type.DNSKEY),
        Map.entry("RRSIG", Type.RRSIG),
        Map.entry("NSEC", Type.NSEC), Map.entry("NSEC3", Type.NSEC3),
        Map.entry("CDS", Type.CDS), Map.entry("CDNSKEY", Type.CDNSKEY)
    );

    @GetMapping("/{domain}")
    public Map<String, Object> lookup(
            @PathVariable String domain,
            @RequestParam(defaultValue = "A,AAAA,MX,TXT,NS") String type,
            @RequestParam(defaultValue = "false") boolean includeRrsig,
            @RequestParam(defaultValue = "false") boolean dnssecSummary) {

        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9._-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }
        rejectReservedTld(domain);

        Map<String, List<String>> records = new LinkedHashMap<>();
        Map<String, List<Map<String, Object>>> detailed = new LinkedHashMap<>();
        Map<String, List<Map<String, Object>>> rrsigByType = new LinkedHashMap<>();
        long start = System.currentTimeMillis();

        for (String t : type.toUpperCase().split(",")) {
            t = t.trim();
            Integer rt = TYPES.get(t);
            if (rt == null) continue;
            collectType(domain, t, rt, records, detailed);
            if (includeRrsig && rt != Type.RRSIG) collectRrsigFor(domain, t, rt, rrsigByType);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("records", records);
        out.put("recordsDetailed", detailed);
        if (includeRrsig) out.put("rrsig", rrsigByType);
        if (dnssecSummary) out.put("dnssec", DnssecChainSummary.of(domain));
        out.put("durationMs", System.currentTimeMillis() - start);
        return out;
    }

    private static void collectType(String domain, String label, int recordType,
            Map<String, List<String>> records,
            Map<String, List<Map<String, Object>>> detailed) {
        List<String> values = new ArrayList<>();
        List<Map<String, Object>> entries = new ArrayList<>();
        Record[] result = BoundedDns.run(domain, recordType);
        if (result != null) {
            for (Record r : result) {
                String rdata = r.rdataToString();
                values.add(rdata);
                entries.add(DnsRecordDescriber.describe(r, rdata));
            }
        }
        records.put(label, values);
        detailed.put(label, entries);
    }

    private static void collectRrsigFor(String domain, String label, int recordType,
            Map<String, List<Map<String, Object>>> rrsigByType) {
        Record[] sigs = BoundedDns.run(domain, Type.RRSIG);
        if (sigs == null) return;
        List<Map<String, Object>> mapped = new ArrayList<>();
        for (Record r : sigs) {
            if (r instanceof RRSIGRecord sig && sig.getTypeCovered() == recordType) {
                mapped.add(DnsRrsigSummary.of(sig));
            }
        }
        if (!mapped.isEmpty()) rrsigByType.put(label, mapped);
    }

    /**
     * RFC 6761 reserved TLDs the public DNS lookup must never query.
     * Mirrors the client-side guard ({@code web/lib/target-guard/}).
     */
    private static final Set<String> RESERVED_TLDS = Set.of(
        "local", "localhost", "test", "invalid", "example",
        "internal", "lan", "home", "corp"
    );

    private static void rejectReservedTld(String domain) {
        int dotIdx = domain.lastIndexOf('.');
        if (dotIdx <= 0) return;
        String tld = domain.substring(dotIdx + 1).toLowerCase();
        if (RESERVED_TLDS.contains(tld)) {
            throw ApiException.forbidden(
                "reserved TLD '" + tld + "' never resolves publicly");
        }
    }
}
