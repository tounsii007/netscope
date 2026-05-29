package io.netscope.dns;

import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Per-record-type metadata extraction. Each DNS record type has its own
 * "interesting fields" — MX preference + exchange, SOA primary NS,
 * DNSKEY KSK-vs-ZSK classification, TLSA association data, etc. This
 * class owns the type-specific knowledge so DnsController stays a thin
 * HTTP boundary.
 *
 * The describer always includes {@code value}, {@code ttl}, and
 * {@code dnsClass}; type-specific fields are added conditionally. The
 * UI can render any field it recognises without knowing the full set.
 */
public final class DnsRecordDescriber {
    private DnsRecordDescriber() {}

    public static Map<String, Object> describe(Record r, String rdata) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("value", rdata);
        m.put("ttl", r.getTTL());
        m.put("dnsClass", DClass.string(r.getDClass()));

        if      (r instanceof MXRecord mx)        addMx(m, mx);
        else if (r instanceof SOARecord soa)      addSoa(m, soa);
        else if (r instanceof CAARecord caa)      addCaa(m, caa);
        else if (r instanceof SRVRecord srv)      addSrv(m, srv);
        else if (r instanceof TLSARecord tlsa)    addTlsa(m, tlsa);
        else if (r instanceof DSRecord ds)        addDs(m, ds);
        else if (r instanceof DNSKEYRecord key)   addDnskey(m, key);
        else if (r instanceof RRSIGRecord sig)    m.putAll(DnsRrsigSummary.of(sig));
        return m;
    }

    private static void addMx(Map<String, Object> m, MXRecord mx) {
        m.put("preference", mx.getPriority());
        m.put("exchange", mx.getTarget().toString(true));
    }

    private static void addSoa(Map<String, Object> m, SOARecord soa) {
        m.put("primaryNs", soa.getHost().toString(true));
        m.put("adminEmail", soa.getAdmin().toString(true));
        m.put("serial", soa.getSerial());
        m.put("refresh", soa.getRefresh());
        m.put("retry", soa.getRetry());
        m.put("expire", soa.getExpire());
        m.put("minimum", soa.getMinimum());
    }

    private static void addCaa(Map<String, Object> m, CAARecord caa) {
        m.put("flags", caa.getFlags());
        m.put("tag", caa.getTag());
        m.put("caaValue", caa.getValue());
    }

    private static void addSrv(Map<String, Object> m, SRVRecord srv) {
        m.put("priority", srv.getPriority());
        m.put("weight", srv.getWeight());
        m.put("port", srv.getPort());
        m.put("target", srv.getTarget().toString(true));
    }

    /** DANE TLSA: surface the four fields users compare against a
     *  published cert. Hex (not raw bytes / base64) for association
     *  data so operators can paste it directly against
     *  {@code openssl s_client} output. */
    private static void addTlsa(Map<String, Object> m, TLSARecord tlsa) {
        m.put("certificateUsage", tlsa.getCertificateUsage());
        m.put("selector", tlsa.getSelector());
        m.put("matchingType", tlsa.getMatchingType());
        m.put("certificateAssociationData", bytesToHex(tlsa.getCertificateAssociationData()));
    }

    private static void addDs(Map<String, Object> m, DSRecord ds) {
        m.put("keyTag", ds.getFootprint());
        m.put("algorithm", ds.getAlgorithm());
        m.put("digestType", ds.getDigestType());
        m.put("digest", bytesToHex(ds.getDigest()));
    }

    /**
     * RFC 4034 §2.1.1 / §4.2.1.1:
     *   bit 7  (=0x0100) — Zone Key flag (any signing key sets this)
     *   bit 15 (=0x0001) — Secure Entry Point (SEP) — only KSKs set it
     * KSK has BOTH bits → flags=257. Test against the combined mask
     * so experimental flag values that happen to share one bit don't
     * mis-classify.
     */
    private static void addDnskey(Map<String, Object> m, DNSKEYRecord key) {
        m.put("flags", key.getFlags());
        m.put("isKsk", (key.getFlags() & 0x0101) == 0x0101);
        m.put("algorithm", key.getAlgorithm());
        m.put("protocol", key.getProtocol());
        m.put("keyTag", key.getFootprint());
    }

    static String bytesToHex(byte[] b) {
        if (b == null) return "";
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x & 0xff));
        return sb.toString();
    }
}
