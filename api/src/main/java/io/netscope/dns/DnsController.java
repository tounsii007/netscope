package io.netscope.dns;

import io.netscope.common.ApiException;
import io.netscope.common.BoundedDns;
import io.netscope.common.DomainNormaliser;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.util.*;

@RestController
@RequestMapping("/api/v1/dns")
public class DnsController {

    /**
     * Record types this endpoint will resolve. Extended beyond the
     * "basic" set to cover modern operational use cases:
     *
     *   • SRV     — service discovery (RFC 2782)
     *   • PTR     — reverse lookups
     *   • TLSA    — DANE certificate associations (RFC 6698)
     *   • SVCB / HTTPS — service binding for HTTP/3 + ECH (RFC 9460)
     *   • DS / DNSKEY  — DNSSEC chain anchors (RFC 4034)
     *   • RRSIG / NSEC / NSEC3 — DNSSEC signature + negative-response proofs
     *   • CDS / CDNSKEY — child-side DNSSEC delegation tokens (RFC 7344)
     */
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
            @RequestParam(defaultValue = "A,AAAA,MX,TXT,NS") String type,
            @RequestParam(defaultValue = "false") boolean includeRrsig,
            @RequestParam(defaultValue = "false") boolean dnssecSummary) {

        // IDN canonicalisation BEFORE the local ASCII regex. Lets queries
        // for münchen.de etc. resolve via xn--mnchen-3ya.de rather than
        // hitting a 400.
        domain = DomainNormaliser.toAscii(domain);
        // Underscore is allowed because DKIM selectors (selector1._domainkey.example.com),
        // DMARC (_dmarc.example.com), ACME HTTP-01 (_acme-challenge.example.com),
        // SRV records (_sip._tcp.example.com), and DNSSEC DS lookups all use
        // underscore-prefixed labels. RFC 1035 forbids underscore in *hostnames*,
        // but DNS query names are a strictly larger set.
        if (domain == null || !domain.matches("^[a-zA-Z0-9._-]{1,253}$")) {
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
        // When includeRrsig=true we surface, per record type, the matching
        // RRSIG (if the zone is signed). Kept separate from the main map so
        // existing consumers that just iterate over `records` aren't broken
        // by RRSIG noise they didn't ask for.
        Map<String, List<Map<String, Object>>> rrsigByType = new LinkedHashMap<>();
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

            if (includeRrsig && rt != Type.RRSIG) {
                Record[] sigs = BoundedDns.run(domain, Type.RRSIG);
                if (sigs != null) {
                    List<Map<String, Object>> mapped = new ArrayList<>();
                    int target = rt;
                    for (Record r : sigs) if (r instanceof RRSIGRecord sig
                        && sig.getTypeCovered() == target) {
                        mapped.add(rrsigSummary(sig));
                    }
                    if (!mapped.isEmpty()) rrsigByType.put(t, mapped);
                }
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("records", records);
        out.put("recordsDetailed", recordsDetailed);
        if (includeRrsig) out.put("rrsig", rrsigByType);
        if (dnssecSummary) out.put("dnssec", dnssecChainSummary(domain));
        out.put("durationMs", System.currentTimeMillis() - start);
        return out;
    }

    /**
     * Compact DNSSEC chain summary: presence of DS at parent (delegation
     * signer published), DNSKEY at apex (zone is signed), and a count of
     * matching algorithms. Designed for at-a-glance rendering in the UI;
     * full chain validation lives in the dedicated DnssecController.
     */
    private static Map<String, Object> dnssecChainSummary(String domain) {
        Map<String, Object> out = new LinkedHashMap<>();
        Record[] ds = BoundedDns.run(domain, Type.DS);
        Record[] dnskey = BoundedDns.run(domain, Type.DNSKEY);
        out.put("dsPresent", ds != null && ds.length > 0);
        out.put("dnskeyPresent", dnskey != null && dnskey.length > 0);
        out.put("dsCount", ds == null ? 0 : ds.length);
        out.put("dnskeyCount", dnskey == null ? 0 : dnskey.length);
        if (dnskey != null) {
            List<Integer> algos = new ArrayList<>();
            for (Record r : dnskey) if (r instanceof DNSKEYRecord k) {
                algos.add(k.getAlgorithm());
            }
            out.put("dnskeyAlgorithms", algos);
        }
        out.put("signed", dnskey != null && dnskey.length > 0);
        out.put("chainAnchored", ds != null && ds.length > 0
            && dnskey != null && dnskey.length > 0);
        return out;
    }

    /** Reduce an RRSIG record to the fields a UI / monitor actually wants
     *  to render — signer, algorithm, validity window, key tag.
     *
     *  Dates: in dnsjava 3.x {@code getExpire()} and {@code getTimeSigned()}
     *  return {@link java.time.Instant}, whose {@code toString()} already
     *  emits ISO 8601 ({@code "2025-09-12T13:45:01Z"}). No further format
     *  conversion needed.
     */
    private static Map<String, Object> rrsigSummary(RRSIGRecord sig) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("typeCovered", Type.string(sig.getTypeCovered()));
        m.put("algorithm", sig.getAlgorithm());
        m.put("labels", sig.getLabels());
        m.put("originalTtl", sig.getOrigTTL());
        m.put("signatureExpiration", sig.getExpire().toString());
        m.put("signatureInception", sig.getTimeSigned().toString());
        m.put("keyTag", sig.getFootprint());
        m.put("signerName", sig.getSigner().toString(true));
        return m;
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
        } else if (r instanceof SRVRecord srv) {
            m.put("priority", srv.getPriority());
            m.put("weight", srv.getWeight());
            m.put("port", srv.getPort());
            m.put("target", srv.getTarget().toString(true));
        } else if (r instanceof TLSARecord tlsa) {
            // DANE: surface the four fields users actually compare against
            // a published cert. Usage 3 + selector 1 + matching 1 is the
            // common "DANE-EE SPKI SHA-256" — by far the most-deployed form.
            //
            // Hex (not raw bytes / base64) for the association-data so
            // operators can paste it directly against `openssl s_client`
            // output. This matches how DS digests are emitted below.
            m.put("certificateUsage", tlsa.getCertificateUsage());
            m.put("selector", tlsa.getSelector());
            m.put("matchingType", tlsa.getMatchingType());
            m.put("certificateAssociationData",
                bytesToHex(tlsa.getCertificateAssociationData()));
        } else if (r instanceof DSRecord ds) {
            m.put("keyTag", ds.getFootprint());
            m.put("algorithm", ds.getAlgorithm());
            m.put("digestType", ds.getDigestType());
            m.put("digest", bytesToHex(ds.getDigest()));
        } else if (r instanceof DNSKEYRecord key) {
            m.put("flags", key.getFlags());
            // RFC 4034 §2.1.1 / 4.2.1.1:
            //   bit 7  (= 0x0100) — Zone Key flag (must be set on any
            //                       key used to sign zone data)
            //   bit 15 (= 0x0001) — Secure Entry Point (SEP) flag
            //                       (set on the KSK that signs DNSKEY
            //                        and is referenced by parent DS)
            // ZSK = 0x0100 only (256); KSK = 0x0101 (257). We test for
            // BOTH bits via the combined mask 0x0101 to avoid matching
            // some experimental flag value that just happens to share
            // one of the two bits.
            m.put("isKsk", (key.getFlags() & 0x0101) == 0x0101);
            m.put("algorithm", key.getAlgorithm());
            m.put("protocol", key.getProtocol());
            m.put("keyTag", key.getFootprint());
        } else if (r instanceof RRSIGRecord sig) {
            // Same surface as the dedicated rrsig helper — duplicated here
            // for callers that requested RRSIG explicitly in `type`.
            m.putAll(rrsigSummary(sig));
        }
        return m;
    }

    private static String bytesToHex(byte[] b) {
        if (b == null) return "";
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x & 0xff));
        return sb.toString();
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
