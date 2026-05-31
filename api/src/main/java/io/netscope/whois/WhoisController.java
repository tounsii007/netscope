package io.netscope.whois;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.netscope.common.errors.ApiException;
import io.netscope.common.http.SafeHttpClient;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

/**
 * Uses RDAP (RFC 7483) — the modern replacement for WHOIS. Returns structured JSON.
 *
 * Redirect handling: {@code rdap.org} replies with HTTP 302s to the TLD-specific
 * RDAP server (e.g. {@code rdap.verisign.com} for .com, {@code rdap.denic.de}
 * for .de). We delegate to {@link SafeHttpClient}, which follows up to 5
 * redirects and re-runs {@code TargetValidator.resolveAndValidate} on every
 * hop — closing the SSRF gap that {@code HttpClient.Redirect.NORMAL} would
 * leave open (an attacker-influenced redirect chain could otherwise land on
 * 127.0.0.1 or cloud-metadata IPs). See F-06 in
 * {@code docs/security-review-2026q2.md}.
 */
@RestController
@RequestMapping("/api/v1/whois")
public class WhoisController {

    private final SafeHttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();

    public WhoisController(SafeHttpClient http) { this.http = http; }

    @GetMapping("/{domain}")
    public Map<String, Object> lookup(@PathVariable String domain) {
        if (!domain.matches("^(?!.*\\.\\.)[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }
        try {
            // F-06: route through SafeHttpClient so each redirect hop is
            // re-validated against the SSRF allow-list (rdap.org → TLD RDAP
            // server can be attacker-influenced for unknown TLDs).
            HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create("https://rdap.org/domain/" + domain))
                    .timeout(Duration.ofSeconds(10))
                    .header("Accept",     "application/rdap+json, application/json")
                    .header("User-Agent", "NetScope/1.0")
                    .GET().build(),
                HttpResponse.BodyHandlers.ofString());
            String body = res.body();
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
            // Strip registrant / admin / tech contact PII from the raw
            // body before returning. Many registries (.de / .co.uk / .ca
            // / some .com when the registrar lacks a privacy proxy)
            // include vcards with name, email, phone, and postal address
            // of the domain owner. Echoing those is doxxing-as-a-service
            // and a GDPR/CCPA exposure for the operator.
            //
            // We keep registrar + abuse contacts (those ARE meant to be
            // public per ICANN) and drop everything else.
            out.put("raw", redactRegistrantPii(j));
            return out;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            // Don't echo raw exception messages OR the user-supplied
            // domain back to the client. The domain passed our strict
            // regex so XSS is impossible today, but defense-in-depth
            // says: don't put user input into error messages at all.
            // The user knows what they typed; the server doesn't need
            // to remind them.
            throw ApiException.badRequest(
                "RDAP lookup failed — the domain may not be registered "
                + "or its registry's RDAP service is unavailable");
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

    /**
     * Return a copy of the RDAP body with every contact whose roles do
     * NOT include "registrar" or "abuse" stripped. The whitelist is
     * intentionally narrow: a sloppy registry that adds tech / admin
     * contacts to the public response will get those dropped here.
     *
     * Roles per RFC 9083 §10.2.4: "registrant", "technical",
     * "administrative", "abuse", "billing", "registrar", "reseller",
     * "sponsor", "proxy", "notifications", "noc". Only the first three
     * carry PII routinely; we whitelist registrar + abuse so the user
     * still sees who to contact for the domain.
     */
    static JsonNode redactRegistrantPii(JsonNode raw) {
        if (raw == null || !raw.isObject()) return raw;
        ObjectNode body = (ObjectNode) raw.deepCopy();
        JsonNode entities = body.path("entities");
        if (!entities.isArray()) return body;

        ArrayNode kept = body.arrayNode();
        for (JsonNode e : entities) {
            JsonNode roles = e.path("roles");
            boolean publicContact = false;
            if (roles.isArray()) {
                for (JsonNode r : roles) {
                    String role = r.asText();
                    if ("registrar".equals(role) || "abuse".equals(role)) {
                        publicContact = true;
                        break;
                    }
                }
            }
            if (publicContact) kept.add(e);
        }
        body.set("entities", kept);
        return body;
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
