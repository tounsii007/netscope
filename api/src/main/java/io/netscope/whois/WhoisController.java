package io.netscope.whois;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.ApiException;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;

/**
 * Uses RDAP (RFC 7483) — the modern replacement for WHOIS. Returns structured JSON.
 *
 * Why the underlying HttpClient is built explicitly:
 *   • {@code rdap.org} replies with HTTP 302 redirects to the TLD-specific
 *     RDAP server (e.g. {@code rdap.verisign.com/com/v1/domain/cloudflare.com}
 *     for .com, {@code rdap.denic.de} for .de, etc.). Java's {@link HttpClient}
 *     defaults to {@code Redirect.NEVER}, so Spring's RestClient.create()
 *     returned a null body and parsing exploded with
 *     "argument \"content\" is null" — surfacing as the user-visible
 *     "RDAP lookup failed".
 *   • Explicit connect+request timeout caps a tarpit RDAP server at 10 s.
 *   • Lazy-init avoids HTTP-stack initialisation in restricted test
 *     environments (and is wasted work if this controller is never called).
 */
@RestController
@RequestMapping("/api/v1/whois")
public class WhoisController {

    private volatile RestClient rest;
    private RestClient rest() {
        RestClient r = rest;
        if (r == null) {
            synchronized (this) {
                if ((r = rest) == null) {
                    HttpClient http = HttpClient.newBuilder()
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .connectTimeout(Duration.ofSeconds(5))
                        .build();
                    var factory = new JdkClientHttpRequestFactory(http);
                    factory.setReadTimeout(Duration.ofSeconds(10));
                    r = rest = RestClient.builder()
                        .requestFactory(factory)
                        .defaultHeader("Accept",     "application/rdap+json, application/json")
                        .defaultHeader("User-Agent", "NetScope/1.0")
                        .build();
                }
            }
        }
        return r;
    }
    private final ObjectMapper mapper = new ObjectMapper();

    @GetMapping("/{domain}")
    public Map<String, Object> lookup(@PathVariable String domain) {
        if (!domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }
        try {
            String body = rest().get()
                .uri("https://rdap.org/domain/{d}", domain)
                .retrieve().body(String.class);
            // Defence in depth: even with redirects enabled, an RDAP server
            // can legitimately return 200 OK with an empty body for an
            // unregistered domain. Surface that as a clear 404 instead of
            // letting Jackson explode with "argument \"content\" is null".
            if (body == null || body.isBlank()) {
                throw ApiException.notFound("domain not found in RDAP registry");
            }
            JsonNode j = mapper.readTree(body);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("domain", domain);
            out.put("handle", j.path("handle").asText(null));
            out.put("status", toStringList(j.path("status")));
            out.put("nameservers", extractNs(j));
            out.put("events", extractEvents(j));
            out.put("registrar", extractRegistrar(j));
            out.put("raw", j);
            return out;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            // Don't echo raw exception messages to the client — they may
            // leak stack frames or internal state. Use a stable user-facing
            // string and log the cause server-side via GlobalExceptionHandler.
            throw ApiException.badRequest("RDAP lookup failed for " + domain
                + " — the domain may not be registered or its registry's RDAP service is unavailable");
        }
    }

    private List<String> toStringList(JsonNode arr) {
        List<String> out = new ArrayList<>();
        if (arr.isArray()) arr.forEach(n -> out.add(n.asText()));
        return out;
    }

    private List<String> extractNs(JsonNode j) {
        List<String> out = new ArrayList<>();
        JsonNode ns = j.path("nameservers");
        if (ns.isArray()) ns.forEach(n -> out.add(n.path("ldhName").asText()));
        return out;
    }

    private Map<String, String> extractEvents(JsonNode j) {
        Map<String, String> out = new LinkedHashMap<>();
        JsonNode ev = j.path("events");
        if (ev.isArray()) {
            for (JsonNode e : ev) out.put(e.path("eventAction").asText(), e.path("eventDate").asText());
        }
        return out;
    }

    private String extractRegistrar(JsonNode j) {
        JsonNode entities = j.path("entities");
        if (entities.isArray()) {
            for (JsonNode e : entities) {
                JsonNode roles = e.path("roles");
                if (roles.isArray()) {
                    for (JsonNode r : roles) {
                        if ("registrar".equals(r.asText())) {
                            JsonNode vcard = e.path("vcardArray");
                            if (vcard.isArray() && vcard.size() > 1) {
                                for (JsonNode item : vcard.get(1)) {
                                    if ("fn".equals(item.path(0).asText())) return item.path(3).asText();
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    }
}
