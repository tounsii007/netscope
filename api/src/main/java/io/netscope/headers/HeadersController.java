package io.netscope.headers;

import io.netscope.common.ApiException;
import io.netscope.common.http.HttpUrlNormaliser;
import io.netscope.common.http.SafeHttpClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(HeadersController.class);

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
        url = HttpUrlNormaliser.ensureHttpScheme(url);
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
            // Parsed HSTS sub-policy: max-age, includeSubDomains, preload.
            // Lets the UI show "max-age=31536000 · includeSubDomains · preload"
            // instead of leaving the user to read the raw header string.
            String hstsRaw = headers.get("strict-transport-security");
            if (hstsRaw != null) out.put("hsts", parseHsts(hstsRaw));
            // CSP sub-summary: list directive count and presence of the
            // most foot-gun-y unsafe-* keywords. The user can audit the
            // full policy in the raw headers panel below.
            String cspRaw = headers.get("content-security-policy");
            if (cspRaw != null) out.put("csp", parseCsp(cspRaw));
            out.put("rawHeaders", headers);
            return out;
        } catch (Exception e) {
            throw ApiException.sanitizedFailure(log, "Header fetch failed", e);
        }
    }

    /**
     * Parse an HSTS header into its three flags. Inputs we expect to
     * handle correctly:
     *   • "max-age=31536000"
     *   • "max-age=31536000; includeSubDomains"
     *   • "max-age=31536000; includeSubDomains; preload"
     *   • "max-age=0"  → effectively disabled, clients should drop policy
     */
    private static Map<String, Object> parseHsts(String raw) {
        Map<String, Object> m = new LinkedHashMap<>();
        long maxAge = -1;
        boolean includeSubDomains = false;
        boolean preload = false;
        for (String piece : raw.toLowerCase().split(";")) {
            String p = piece.trim();
            if (p.startsWith("max-age=")) {
                try { maxAge = Long.parseLong(p.substring(8).trim()); } catch (NumberFormatException ignored) {}
            } else if (p.equals("includesubdomains")) {
                includeSubDomains = true;
            } else if (p.equals("preload")) {
                preload = true;
            }
        }
        m.put("maxAge", maxAge);
        m.put("includeSubDomains", includeSubDomains);
        m.put("preload", preload);
        // Common Mozilla HSTS-preload-eligibility check: max-age >= 1 year
        // and both flags present.
        m.put("preloadEligible", maxAge >= 31536000 && includeSubDomains && preload);
        return m;
    }

    /**
     * Quick CSP audit. We don't try to fully parse the policy — that's
     * the headers-deep tool's job — but we surface the directive count
     * and whether any of the high-risk unsafe-* keywords appear.
     */
    private static Map<String, Object> parseCsp(String raw) {
        String lower = raw.toLowerCase();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("directiveCount", raw.split(";").length);
        m.put("hasUnsafeInline", lower.contains("'unsafe-inline'"));
        m.put("hasUnsafeEval", lower.contains("'unsafe-eval'"));
        m.put("hasWildcard", lower.contains(" *") || lower.contains("default-src *"));
        return m;
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
