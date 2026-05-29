package io.netscope.cdn;

import io.netscope.common.ApiException;
import io.netscope.common.SafeHttpClient;
import io.netscope.common.TargetValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

/**
 * Heuristic CDN/WAF detection using response headers, cookies, CNAME hints,
 * and the 'server' banner. Not perfect, but matches what cdnfinder / whatcms do.
 */
@RestController
@RequestMapping("/api/v1/cdn")
public class CdnController {

    private static final Logger log = LoggerFactory.getLogger(CdnController.class);

    private record Signal(String cdn, String where, String pattern) {}

    private static final List<Signal> SIGNALS = List.of(
        new Signal("Cloudflare",   "header", "cf-ray"),
        new Signal("Cloudflare",   "header", "server=cloudflare"),
        new Signal("Fastly",       "header", "fastly-debug"),
        new Signal("Fastly",       "header", "x-served-by=cache-"),
        new Signal("Akamai",       "header", "x-akamai"),
        new Signal("Akamai",       "header", "akamaighost"),
        new Signal("AWS CloudFront","header","x-amz-cf-id"),
        new Signal("AWS CloudFront","header","via=cloudfront"),
        new Signal("Google Cloud CDN","header","via=google"),
        new Signal("Bunny",        "header", "server=bunnycdn"),
        new Signal("KeyCDN",       "header", "server=keycdn"),
        new Signal("StackPath",    "header", "x-hw"),
        new Signal("Sucuri",       "header", "x-sucuri-id"),
        new Signal("Imperva",      "header", "x-iinfo"),
        new Signal("Azure Front Door","header","x-azure-ref"),
        new Signal("Vercel",       "header", "x-vercel-id"),
        new Signal("Netlify",      "header", "x-nf-request-id"),
        new Signal("GitHub Pages", "header", "server=github.com")
    );

    private final TargetValidator validator;
    private final SafeHttpClient http;

    public CdnController(TargetValidator v, SafeHttpClient http) {
        this.validator = v; this.http = http;
    }

    @GetMapping("/{host}")
    public Map<String, Object> detect(@PathVariable String host) {
        InetAddress addr = validator.resolveAndValidate(host);
        try {
            HttpResponse<Void> res = http.send(
                HttpRequest.newBuilder(URI.create("https://" + host + "/"))
                    .timeout(Duration.ofSeconds(8))
                    .header("User-Agent", "NetScope/1.0").GET().build(),
                HttpResponse.BodyHandlers.discarding());

            Map<String, String> h = new LinkedHashMap<>();
            res.headers().map().forEach((k, v) -> h.put(k.toLowerCase(), String.join(", ", v).toLowerCase()));

            LinkedHashSet<String> detected = new LinkedHashSet<>();
            List<Map<String, Object>> matches = new ArrayList<>();
            for (Signal s : SIGNALS) {
                String[] parts = s.pattern().split("=", 2);
                String hv = h.get(parts[0]);
                if (hv != null && (parts.length == 1 || hv.contains(parts[1]))) {
                    detected.add(s.cdn());
                    matches.add(Map.of("cdn", s.cdn(), "signal", s.pattern()));
                }
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("host", host);
            out.put("resolvedIp", addr.getHostAddress());
            out.put("cdns", new ArrayList<>(detected));
            out.put("usesCdn", !detected.isEmpty());
            out.put("server", h.getOrDefault("server", null));
            out.put("matches", matches);
            out.put("status", res.statusCode());
            return out;
        } catch (Exception e) {
            throw ApiException.sanitizedFailure(log, "CDN detection failed", e);
        }
    }
}
