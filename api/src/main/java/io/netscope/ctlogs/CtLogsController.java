package io.netscope.ctlogs;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.ApiException;
import io.netscope.common.DomainNormaliser;
import io.netscope.common.ToolMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Certificate Transparency log search.
 *
 * Queries crt.sh — the public CT-log frontend run by Sectigo — for every
 * certificate ever issued for a domain (and optionally its subdomains).
 * Each CT log entry surfaces the issuer CA, the leaf SANs, the validity
 * window, and the precertificate / log entry IDs.
 *
 * Use cases:
 *   • Verify that no certificates were issued for a domain you control
 *     by a CA you did not authorise (mis-issuance detection).
 *   • Discover certificates for subdomains an attacker registered as a
 *     CT-side-channel reconnaissance pivot.
 *   • Audit the lifetime + key-type history of a public service.
 *
 * The {@code subdomains} controller already taps crt.sh to enumerate
 * subdomains; this controller exposes the certificate records themselves
 * so users can inspect issuer + dates + SANs without re-pivoting through
 * the subdomain UI.
 */
@RestController
@RequestMapping("/api/v1/ct-logs")
public class CtLogsController {

    private static final Logger log = LoggerFactory.getLogger(CtLogsController.class);
    /** crt.sh JSON output. The leading {@code %25.} wildcard matches both
     *  the apex and every subdomain when {@code includeSubdomains=true}. */
    private static final String CRT_SH_BASE = "https://crt.sh/";
    /** Sanity cap to keep the response shape predictable for the UI. */
    private static final int MAX_RESULTS = 200;
    /** Hard ceiling. crt.sh can return tens of thousands of rows for a
     *  popular root domain (e.g. google.com) — bound the wire bytes to
     *  prevent a single request from holding an HTTP connection open
     *  for minutes. */
    private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(15);

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        // crt.sh occasionally 301s to its HTTPS variant; one hop is fine.
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
        // IDN canonicalisation BEFORE the local ASCII regex check so
        // münchen.de et al reach crt.sh as xn--mnchen-3ya.de rather than
        // being rejected outright. See DomainNormaliser for the policy
        // rationale (USE_STD3_ASCII_RULES).
        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }

        // crt.sh interprets `q` as a SQL LIKE pattern. The wildcard
        // character is `%` — which is also the URL-encoding escape
        // character. The PREVIOUS code wrote `"%25." + domain` here,
        // thinking it was pre-encoding the wildcard for the URL — but
        // URLEncoder.encode then encoded the `%` AGAIN to `%25`, so the
        // wire URL contained `q=%2525.example.com`. crt.sh's URL decoder
        // emitted `%25.example.com` to SQL, where `%25` is just literal
        // text — so the subdomain search matched nothing.
        // Correct: build the raw SQL pattern `%.example.com` and let
        // URLEncoder encode it exactly once.
        String query = includeSubdomains ? "%." + domain : domain;
        String url = CRT_SH_BASE + "?q=" + URLEncoder.encode(query, StandardCharsets.UTF_8) + "&output=json";

        List<Map<String, Object>> raw;
        long start = System.currentTimeMillis();
        try {
            HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create(url))
                    .timeout(HTTP_TIMEOUT)
                    .header("User-Agent", "NetScope/1.0 (CT-Logs probe)")
                    .header("Accept", "application/json")
                    .GET().build(),
                HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 404) {
                // crt.sh returns 404 when the search yields nothing.
                return emptyResult(domain, includeSubdomains, start);
            }
            if (res.statusCode() != 200) {
                throw ApiException.badRequest("CT log upstream returned HTTP " + res.statusCode());
            }
            raw = mapper.readValue(res.body(), new TypeReference<>() {});
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("crt.sh probe failed for {}: {}", domain, e.toString());
            throw ApiException.badRequest("CT log lookup failed: " + e.getClass().getSimpleName());
        }

        LocalDate today = LocalDate.now();
        // Resolve in TWO passes so we can compute truncated against the
        // post-filter count, not the raw upstream count. The previous
        // single-pipe computation `raw.size() > MAX_RESULTS` falsely
        // fired the truncated badge whenever `excludeExpired=true` left
        // fewer than MAX_RESULTS visible rows but upstream had
        // returned more raw rows (most of them already expired).
        List<Map<String, Object>> eligible = raw.stream()
            .map(row -> normalize(row, today))
            .filter(Objects::nonNull)
            .filter(row -> !excludeExpired || !((Boolean) row.get("expired")))
            .sorted(Comparator.comparing(
                (Map<String, Object> m) -> (String) m.get("notBefore")).reversed())
            .collect(Collectors.toList());
        boolean truncated = eligible.size() > MAX_RESULTS;
        List<Map<String, Object>> normalized = truncated
            ? eligible.subList(0, MAX_RESULTS)
            : eligible;

        // Aggregate distinct issuers — quick sniff test for unauthorised CAs.
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

    private static Map<String, Object> emptyResult(String domain, boolean includeSubdomains, long startMs) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("includeSubdomains", includeSubdomains);
        out.put("totalReturned", 0);
        out.put("truncated", false);
        out.put("issuerSummary", Map.of());
        out.put("certificates", List.of());
        // Surface durationMs even on the empty path so monitoring
        // dashboards don't get a "field disappears intermittently" shape
        // — every successful response now carries the same key set.
        out.put("durationMs", System.currentTimeMillis() - startMs);
        return out;
    }

    /** Package-private for unit tests — the date math + SAN-split logic
     *  here is the trickiest part of this controller and we want to
     *  exercise it without standing up WireMock. */
    static Map<String, Object> normalize(Map<String, Object> row, LocalDate today) {
        try {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("id",              row.get("id"));
            n.put("serial",          row.get("serial_number"));
            n.put("commonName",      row.get("common_name"));
            n.put("nameValue",       row.get("name_value"));
            n.put("issuerCaName",    row.get("issuer_name"));
            n.put("issuerCaId",      row.get("issuer_ca_id"));
            String notBefore = (String) row.get("not_before");
            String notAfter  = (String) row.get("not_after");
            // Skip rows with missing dates entirely rather than silently
            // substituting epoch — the previous safePrefix fallback
            // produced rows that were always "expired by ~55 years"
            // which polluted the issuer summary aggregate and the
            // "n certificates" headline. crt.sh normally populates
            // both fields, but mid-import we occasionally see partial
            // rows; the caller filters Objects::nonNull so a null
            // return here is the clean signal.
            if (notBefore == null || notAfter == null) return null;
            n.put("notBefore", notBefore);
            n.put("notAfter",  notAfter);

            // Parse dates the way crt.sh emits them ("2025-09-12T13:45:01").
            LocalDate before = LocalDate.parse(safePrefix(notBefore, 10));
            LocalDate after  = LocalDate.parse(safePrefix(notAfter, 10));
            n.put("validForDays", (int) (after.toEpochDay() - before.toEpochDay()));
            n.put("expired",      after.isBefore(today));
            n.put("daysUntilExpiry", (int) (after.toEpochDay() - today.toEpochDay()));

            // name_value is newline-separated SANs; surface them as an array.
            String nv = (String) row.get("name_value");
            if (nv != null) {
                List<String> sans = Arrays.stream(nv.split("\\R"))
                    .map(String::trim).filter(s -> !s.isEmpty())
                    .distinct().collect(Collectors.toList());
                n.put("sans", sans);
            } else {
                n.put("sans", List.of());
            }
            return n;
        } catch (Exception e) {
            // Skip rows we can't parse rather than failing the whole response.
            return null;
        }
    }

    private static String safePrefix(String s, int n) {
        if (s == null) return "1970-01-01";
        return s.length() >= n ? s.substring(0, n) : s;
    }

    /** Internal helper exposed for tests — keeps the date-math reachable. */
    static String formatDate(LocalDate d) { return d.format(DateTimeFormatter.ISO_LOCAL_DATE); }
}
