package io.netscope.bgp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.netscope.common.ApiException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.util.*;

/**
 * Wraps RIPE Stat's public data APIs (CC BY 4.0) to return BGP prefixes,
 * upstream ASNs, and announcement history for any IP or ASN.
 */
@RestController
@RequestMapping("/api/v1/bgp")
public class BgpController {

    private final RestClient rest = RestClient.builder()
        .defaultHeader("User-Agent", "NetScope/1.0").build();
    private final ObjectMapper mapper = new ObjectMapper();

    @GetMapping("/ip/{ip}")
    @CircuitBreaker(name = "ripe", fallbackMethod = "ipFallback")
    public Map<String, Object> ip(@PathVariable String ip) {
        if (!ip.matches("^[0-9a-fA-F:.]+$")) throw ApiException.badRequest("invalid IP");
        try {
            JsonNode prefix = ripe("prefix-overview", ip);
            JsonNode geo    = ripe("maxmind-geo-lite", ip);
            JsonNode history = ripe("bgp-state", ip);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ip", ip);
            out.put("prefix", prefix.path("data").path("resource").asText(null));
            out.put("announced", prefix.path("data").path("announced").asBoolean());
            List<Map<String, Object>> asns = new ArrayList<>();
            JsonNode asList = prefix.path("data").path("asns");
            if (asList.isArray()) for (JsonNode n : asList) {
                asns.add(Map.of("asn", "AS" + n.path("asn").asText(),
                    "holder", n.path("holder").asText()));
            }
            out.put("asns", asns);
            out.put("relatedPrefixes", toStringList(prefix.path("data").path("related_prefixes")));
            out.put("block", prefix.path("data").path("block").path("resource").asText(null));
            out.put("geo", Map.of(
                "country", geo.path("data").path("located_resources").path(0).path("locations").path(0).path("country").asText(null),
                "city",    geo.path("data").path("located_resources").path(0).path("locations").path(0).path("city").asText(null)
            ));
            out.put("bgpState", history.path("data").path("bgp_state"));
            return out;
        } catch (Exception e) {
            throw ApiException.badRequest("RIPE lookup failed: " + e.getMessage());
        }
    }

    @GetMapping("/asn/{asn}")
    @CircuitBreaker(name = "ripe", fallbackMethod = "asnFallback")
    public Map<String, Object> asn(@PathVariable String asn) {
        String num = asn.toUpperCase().startsWith("AS") ? asn.substring(2) : asn;
        if (!num.matches("\\d+")) throw ApiException.badRequest("invalid ASN");
        try {
            JsonNode overview = ripe("as-overview", "AS" + num);
            JsonNode announced = ripe("announced-prefixes", "AS" + num);
            JsonNode neighbours = ripe("asn-neighbours", "AS" + num);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("asn", "AS" + num);
            out.put("holder", overview.path("data").path("holder").asText(null));
            out.put("announcedPrefixes", announced.path("data").path("prefixes").size());
            List<String> sampleP = new ArrayList<>();
            announced.path("data").path("prefixes").forEach(p -> {
                if (sampleP.size() < 50) sampleP.add(p.path("prefix").asText());
            });
            out.put("prefixSample", sampleP);
            out.put("neighbourCount", neighbours.path("data").path("neighbours").size());
            return out;
        } catch (Exception e) {
            throw ApiException.badRequest("RIPE lookup failed: " + e.getMessage());
        }
    }

    private JsonNode ripe(String endpoint, String resource) throws Exception {
        String body = rest.get()
            .uri("https://stat.ripe.net/data/{e}/data.json?resource={r}&sourceapp=netscope",
                endpoint, resource)
            .retrieve().body(String.class);
        return mapper.readTree(body);
    }

    private List<String> toStringList(JsonNode arr) {
        List<String> out = new ArrayList<>();
        if (arr.isArray()) arr.forEach(n -> out.add(n.asText()));
        return out;
    }

    @SuppressWarnings("unused")
    public Map<String, Object> ipFallback(String ip, Throwable t) {
        return Map.of("ip", ip, "degraded", true, "reason", "RIPE Stat unavailable");
    }
    @SuppressWarnings("unused")
    public Map<String, Object> asnFallback(String asn, Throwable t) {
        return Map.of("asn", asn, "degraded", true, "reason", "RIPE Stat unavailable");
    }
}
