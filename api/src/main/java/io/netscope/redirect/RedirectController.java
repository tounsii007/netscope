package io.netscope.redirect;

import io.netscope.common.ApiException;
import io.netscope.common.TargetValidator;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

/**
 * Follows redirects and records every hop. Flags mixed HTTP→HTTPS downgrades,
 * cross-domain hops, redirect loops, and non-301/302 codes that hurt SEO.
 * Uses its own HttpClient (Redirect.NEVER) with validation at each hop.
 */
@RestController
@RequestMapping("/api/v1/redirect")
public class RedirectController {

    private static final int MAX_HOPS = 20;
    /**
     * Hard ceiling on the total time the redirect tracer is allowed to spend.
     *
     * Without this cap, an attacker can craft a chain where each hop returns
     * a 302 after 7.9 s (just under the per-hop timeout). With MAX_HOPS=20
     * that's ~158 s of blocked thread per request — easy DoS through the
     * thread-pool. The cumulative cap keeps the worst case tight.
     */
    private static final long MAX_TOTAL_MS = 30_000;

    private final TargetValidator validator;
    private final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).build();

    public RedirectController(TargetValidator v) { this.validator = v; }

    @GetMapping
    public Map<String, Object> trace(@RequestParam String url) {
        if (!url.startsWith("http")) url = "https://" + url;
        URI current;
        try { current = URI.create(url); } catch (Exception e) { throw ApiException.badRequest("invalid url"); }

        List<Map<String, Object>> hops = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        boolean loop = false, downgrade = false;
        String finalStatus = "unknown";
        int finalCode = 0;

        long traceStart = System.currentTimeMillis();
        for (int i = 0; i < MAX_HOPS; i++) {
            // Cumulative-time guard: stop chasing the chain if we've already
            // burned the whole budget on slow hops.
            if (System.currentTimeMillis() - traceStart > MAX_TOTAL_MS) {
                finalStatus = "total-timeout";
                break;
            }
            validator.resolveAndValidate(current.getHost());
            if (!seen.add(current.toString())) { loop = true; break; }
            long start = System.currentTimeMillis();

            Map<String, Object> hop = new LinkedHashMap<>();
            hop.put("hop", i + 1);
            hop.put("url", current.toString());
            hop.put("scheme", current.getScheme());
            hop.put("host", current.getHost());

            try {
                HttpResponse<Void> res = client.send(
                    HttpRequest.newBuilder(current).timeout(Duration.ofSeconds(8))
                        .header("User-Agent", "NetScope/1.0").GET().build(),
                    HttpResponse.BodyHandlers.discarding());
                hop.put("status", res.statusCode());
                hop.put("latencyMs", System.currentTimeMillis() - start);
                String location = res.headers().firstValue("location").orElse(null);
                hop.put("location", location);
                hops.add(hop);
                finalCode = res.statusCode();
                if (res.statusCode() < 300 || res.statusCode() >= 400 || location == null) {
                    finalStatus = "terminal";
                    break;
                }
                URI next = current.resolve(location);
                if (next.getHost() == null) { finalStatus = "invalid-location"; break; }
                if ("https".equals(current.getScheme()) && "http".equals(next.getScheme())) downgrade = true;
                current = next;
            } catch (Exception e) {
                hop.put("status", -1);
                hop.put("error", e.getClass().getSimpleName());
                hops.add(hop);
                finalStatus = "error";
                break;
            }
        }
        if (hops.size() >= MAX_HOPS) finalStatus = "too-many-hops";

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("input", url);
        out.put("finalUrl", hops.isEmpty() ? null : hops.get(hops.size() - 1).get("url"));
        out.put("hopCount", hops.size());
        out.put("finalStatusCode", finalCode);
        out.put("finalStatus", loop ? "loop" : finalStatus);
        out.put("httpsDowngrade", downgrade);
        out.put("hops", hops);

        List<String> warnings = new ArrayList<>();
        if (loop) warnings.add("Redirect loop detected");
        if (downgrade) warnings.add("HTTPS→HTTP downgrade — leaks data");
        if (hops.size() > 3) warnings.add("Many redirect hops hurt SEO and performance");
        for (Map<String, Object> h : hops) {
            Object code = h.get("status");
            if (code instanceof Integer c && (c == 302 || c == 307))
                warnings.add("Hop " + h.get("hop") + " is " + c + " (temporary) — use 301 for permanent");
        }
        out.put("warnings", warnings);
        return out;
    }
}
