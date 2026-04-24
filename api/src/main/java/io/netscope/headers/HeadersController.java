package io.netscope.headers;

import io.netscope.common.ApiException;
import io.netscope.common.SafeHttpClient;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

/**
 * Fetches HTTP headers and grades security posture A+ ... F based on presence
 * and quality of headers like HSTS, CSP, X-Frame-Options, Referrer-Policy.
 */
@RestController
@RequestMapping("/api/v1/headers")
public class HeadersController {

    private record Rule(String header, int weight, String good, String detail) {}

    private static final List<Rule> RULES = List.of(
        new Rule("strict-transport-security", 25, "max-age", "Enforces HTTPS. Recommend max-age=31536000; includeSubDomains; preload."),
        new Rule("content-security-policy",   25, "",        "Prevents XSS and injection. Start with default-src 'self'."),
        new Rule("x-frame-options",           10, "",        "Blocks clickjacking. Prefer DENY or SAMEORIGIN."),
        new Rule("x-content-type-options",    10, "nosniff", "Stops MIME sniffing. Set to nosniff."),
        new Rule("referrer-policy",           10, "",        "Controls referer leakage. strict-origin-when-cross-origin is sensible."),
        new Rule("permissions-policy",        10, "",        "Disables powerful features you do not use."),
        new Rule("cross-origin-opener-policy", 5, "",        "Isolates browsing context (Spectre mitigation)."),
        new Rule("cross-origin-resource-policy", 5, "",      "Prevents cross-origin loading of your resources.")
    );

    private final SafeHttpClient http;

    public HeadersController(SafeHttpClient http) { this.http = http; }

    @GetMapping
    public Map<String, Object> inspect(@RequestParam String url) {
        if (!url.startsWith("http")) url = "https://" + url;
        URI uri;
        try { uri = URI.create(url); } catch (Exception e) { throw ApiException.badRequest("invalid url"); }

        try {
            HttpResponse<Void> res = http.send(
                HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))
                    .header("User-Agent", "NetScope/1.0").GET().build(),
                HttpResponse.BodyHandlers.discarding());

            Map<String, String> headers = new LinkedHashMap<>();
            res.headers().map().forEach((k, v) -> headers.put(k.toLowerCase(), String.join(", ", v)));

            int score = 0, max = 0;
            List<Map<String, Object>> checks = new ArrayList<>();
            for (Rule r : RULES) {
                max += r.weight();
                String val = headers.get(r.header());
                boolean present = val != null;
                boolean good = present && (r.good().isEmpty() || val.toLowerCase().contains(r.good()));
                if (good) score += r.weight();
                else if (present) score += r.weight() / 2;

                checks.add(Map.of(
                    "header", r.header(), "present", present, "good", good,
                    "value", val == null ? "" : val, "weight", r.weight(),
                    "detail", r.detail()));
            }

            int pct = (int) Math.round(score * 100.0 / max);
            String grade = grade(pct);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("url", url);
            out.put("status", res.statusCode());
            out.put("grade", grade);
            out.put("score", pct);
            out.put("server", headers.getOrDefault("server", null));
            out.put("poweredBy", headers.getOrDefault("x-powered-by", null));
            out.put("checks", checks);
            out.put("rawHeaders", headers);
            return out;
        } catch (Exception e) {
            throw ApiException.badRequest("fetch failed: " + e.getMessage());
        }
    }

    private String grade(int pct) {
        if (pct >= 95) return "A+";
        if (pct >= 85) return "A";
        if (pct >= 75) return "B";
        if (pct >= 60) return "C";
        if (pct >= 40) return "D";
        return "F";
    }
}
