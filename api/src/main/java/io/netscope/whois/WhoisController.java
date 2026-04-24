package io.netscope.whois;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.ApiException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.util.*;

/**
 * Uses RDAP (RFC 7483) — the modern replacement for WHOIS. Returns structured JSON.
 */
@RestController
@RequestMapping("/api/v1/whois")
public class WhoisController {

    private final RestClient rest = RestClient.create();
    private final ObjectMapper mapper = new ObjectMapper();

    @GetMapping("/{domain}")
    public Map<String, Object> lookup(@PathVariable String domain) {
        if (!domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }
        try {
            String body = rest.get()
                .uri("https://rdap.org/domain/{d}", domain)
                .retrieve().body(String.class);
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
        } catch (Exception e) {
            throw ApiException.badRequest("RDAP lookup failed: " + e.getMessage());
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
