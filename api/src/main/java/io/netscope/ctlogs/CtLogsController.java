package io.netscope.ctlogs;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.errors.ApiException;
import io.netscope.common.security.DomainNormaliser;
import io.netscope.common.observability.ToolMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Certificate Transparency log search. Thin HTTP boundary; the
 * substantive logic lives in:
 *
 *   • {@link CtLogQuery}        — crt.sh search URL construction
 *   • {@link CtLogRowNormaliser} — single-row JSON → response shape
 *
 * The remaining responsibilities here are: input validation, HTTP
 * fetch + body deserialisation, post-filter sort + cap, and
 * response-envelope assembly.
 */
@RestController
@RequestMapping("/api/v1/ct-logs")
public class CtLogsController {

    private static final Logger log = LoggerFactory.getLogger(CtLogsController.class);
    private static final int MAX_RESULTS = 200;
    private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(15);

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final ToolMetrics metrics;

    public CtLogsController(ToolMetrics metrics) {
        this.metrics = metrics;
    }

    @GetMapping("/{domain}")
    public Map<String, Object> search(
            @PathVariable String domain,
            @RequestParam(defaultValue = "true") boolean includeSubdomains,
            @RequestParam(defaultValue = "false") boolean excludeExpired) {
        return metrics.record("ct-logs", "search",
            () -> searchInternal(domain, includeSubdomains, excludeExpired));
    }

    private Map<String, Object> searchInternal(String domain,
            boolean includeSubdomains, boolean excludeExpired) {

        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }

        long start = System.currentTimeMillis();
        List<Map<String, Object>> raw = fetchRaw(domain, includeSubdomains, start);
        if (raw == null) return emptyResult(domain, includeSubdomains, start);

        LocalDate today = LocalDate.now();
        List<Map<String, Object>> eligible = raw.stream()
            .map(row -> CtLogRowNormaliser.normalise(row, today))
            .filter(Objects::nonNull)
            .filter(row -> !excludeExpired || !((Boolean) row.get("expired")))
            .sorted(Comparator.comparing(
                (Map<String, Object> m) -> (String) m.get("notBefore")).reversed())
            .collect(Collectors.toList());

        boolean truncated = eligible.size() > MAX_RESULTS;
        List<Map<String, Object>> normalized = truncated
            ? eligible.subList(0, MAX_RESULTS)
            : eligible;

        Map<String, Long> byIssuer = normalized.stream()
            .collect(Collectors.groupingBy(
                m -> (String) m.getOrDefault("issuerCaName", "unknown"),
                Collectors.counting()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("includeSubdomains", includeSubdomains);
        out.put("totalReturned", normalized.size());
        out.put("truncated", truncated);
        out.put("issuerSummary", byIssuer);
        out.put("certificates", normalized);
        out.put("durationMs", System.currentTimeMillis() - start);
        return out;
    }

    private List<Map<String, Object>> fetchRaw(String domain,
            boolean includeSubdomains, long start) {
        String url = CtLogQuery.build(domain, includeSubdomains);
        try {
            HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create(url))
                    .timeout(HTTP_TIMEOUT)
                    .header("User-Agent", "NetScope/1.0 (CT-Logs probe)")
                    .header("Accept", "application/json")
                    .GET().build(),
                HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 404) return null; // empty result
            if (res.statusCode() != 200) {
                throw ApiException.badRequest("CT log upstream returned HTTP " + res.statusCode());
            }
            return mapper.readValue(res.body(), new TypeReference<>() {});
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("crt.sh probe failed for {}: {}", domain, e.toString());
            throw ApiException.sanitizedFailure(log, "CT log lookup failed", e);
        }
    }

    private static Map<String, Object> emptyResult(String domain,
            boolean includeSubdomains, long startMs) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("includeSubdomains", includeSubdomains);
        out.put("totalReturned", 0);
        out.put("truncated", false);
        out.put("issuerSummary", Map.of());
        out.put("certificates", List.of());
        out.put("durationMs", System.currentTimeMillis() - startMs);
        return out;
    }

    /** Legacy shim — the existing CtLogsControllerTest exercises
     *  normalize() directly. Delegate to the new normaliser so the
     *  test contract holds. */
    static Map<String, Object> normalize(Map<String, Object> row, LocalDate today) {
        return CtLogRowNormaliser.normalise(row, today);
    }
}
