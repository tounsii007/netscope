package io.netscope.dns;

import io.netscope.common.BoundedDns;
import org.xbill.DNS.DNSKEYRecord;
import org.xbill.DNS.Record;
import org.xbill.DNS.Type;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Compact DNSSEC chain summary for a zone: DS presence at the parent
 * (delegation signer published), DNSKEY presence at the apex (zone is
 * signed), and a count of matching algorithms. Designed for at-a-
 * glance UI rendering; full chain validation lives in
 * {@code DnssecController}.
 *
 * Why a separate class: the chain-summary heuristic ("signed",
 * "chainAnchored") changes as DNSSEC operational practices evolve.
 * Isolating it lets that evolution happen without rewriting
 * DnsController each time.
 */
public final class DnssecChainSummary {
    private DnssecChainSummary() {}

    public static Map<String, Object> of(String domain) {
        Map<String, Object> out = new LinkedHashMap<>();
        Record[] ds = BoundedDns.run(domain, Type.DS);
        Record[] dnskey = BoundedDns.run(domain, Type.DNSKEY);

        out.put("dsPresent",   ds != null && ds.length > 0);
        out.put("dnskeyPresent", dnskey != null && dnskey.length > 0);
        out.put("dsCount",     ds == null ? 0 : ds.length);
        out.put("dnskeyCount", dnskey == null ? 0 : dnskey.length);
        if (dnskey != null) {
            List<Integer> algos = new ArrayList<>();
            for (Record r : dnskey) if (r instanceof DNSKEYRecord k) algos.add(k.getAlgorithm());
            out.put("dnskeyAlgorithms", algos);
        }
        out.put("signed", dnskey != null && dnskey.length > 0);
        out.put("chainAnchored",
            ds != null && ds.length > 0 && dnskey != null && dnskey.length > 0);
        return out;
    }
}
