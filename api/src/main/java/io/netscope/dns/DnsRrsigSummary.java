package io.netscope.dns;

import org.xbill.DNS.RRSIGRecord;
import org.xbill.DNS.Type;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Reduce an RRSIG record to the seven fields a UI or monitor actually
 * wants to render: type covered, algorithm, label count, original TTL,
 * inception + expiry timestamps, key tag, signer name.
 *
 * Dates: dnsjava 3.x returns {@link java.time.Instant} from
 * {@link RRSIGRecord#getExpire()} and {@link RRSIGRecord#getTimeSigned()},
 * and {@code Instant#toString()} emits ISO 8601 by default — no further
 * format conversion needed.
 */
public final class DnsRrsigSummary {
    private DnsRrsigSummary() {}

    public static Map<String, Object> of(RRSIGRecord sig) {
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
}
