package io.netscope.doh;

import io.netscope.common.BoundedDns;
import org.xbill.DNS.DohResolver;
import org.xbill.DNS.Record;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Single-call DoH query against one provider. Wraps dnsjava's
 * {@link DohResolver} in {@link BoundedDns} so we never block longer
 * than the per-probe timeout, and always returns a populated result
 * map regardless of upstream errors.
 *
 * The result shape mirrors what the controller assembles into the
 * per-resolver row:
 *   • {@code ok}          — true when records were returned
 *   • {@code latencyMs}   — wall-clock time spent inside the probe
 *   • {@code answerCount} — how many records came back
 *   • {@code error}       — class name on failure, absent on success
 */
public final class DohResolverProbe {
    private DohResolverProbe() {}

    public record Result(Map<String, Object> doh, List<String> answers) {}

    public static Result query(String dohUrl, String domain, int recordType, Duration timeout) {
        long t0 = System.currentTimeMillis();
        try {
            DohResolver resolver = new DohResolver(dohUrl);
            resolver.setTimeout(timeout);
            Record[] records = BoundedDns.run(domain, recordType, resolver);
            long elapsed = System.currentTimeMillis() - t0;

            Map<String, Object> doh = new LinkedHashMap<>();
            doh.put("ok", records != null);
            doh.put("latencyMs", elapsed);
            doh.put("answerCount", records == null ? 0 : records.length);

            List<String> answers = new ArrayList<>();
            if (records != null) for (Record rec : records) answers.add(rec.rdataToString());
            return new Result(doh, answers);
        } catch (Exception e) {
            Map<String, Object> doh = new LinkedHashMap<>();
            doh.put("ok", false);
            doh.put("latencyMs", System.currentTimeMillis() - t0);
            doh.put("error", e.getClass().getSimpleName());
            return new Result(doh, List.of());
        }
    }
}
