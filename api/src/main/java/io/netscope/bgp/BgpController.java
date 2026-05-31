package io.netscope.bgp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.netscope.common.errors.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.util.*;

/**
 * Wraps RIPE Stat's public data APIs (CC BY 4.0) to return BGP prefixes,
 * upstream ASNs, and announcement history for any IP or ASN.
 */
@Tag(name = "IP", description = "BGP prefix, upstream ASN, and announcement history lookups via RIPE Stat")
@RestController
@RequestMapping("/api/v1/bgp")
public class BgpController {

    private static final Logger log = LoggerFactory.getLogger(BgpController.class);

    // Lazy-init: building a RestClient at field-init time triggers HTTP-stack
    // setup that can fail in restricted test environments (and is wasted work
    // for instances that never see traffic). Cached after first call.
    private volatile RestClient rest;
    private RestClient rest() {
        RestClient r = rest;
        if (r == null) {
            synchronized (this) {
                if ((r = rest) == null) {
                    r = rest = RestClient.builder()
                        .defaultHeader("User-Agent", "NetScope/1.0").build();
                }
            }
        }
        return r;
    }
    private final ObjectMapper mapper = new ObjectMapper();

    @Operation(summary = "Lookup BGP prefix and ASNs for an IP")
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
            throw ApiException.sanitizedFailure(log, "RIPE lookup failed", e);
        }
    }

    @Operation(summary = "Get ASN overview and announced prefix sample")
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
            throw ApiException.sanitizedFailure(log, "RIPE lookup failed", e);
        }
    }

    /**
     * Hits one of RIPE Stat's data endpoints. {@code protected} (not
     * private) so unit tests can subclass {@link BgpController} and
     * override this with a stub that throws — that's how the input-guard
     * tests verify the controller wraps network failures in
     * {@link ApiException} without depending on stat.ripe.net being
     * reachable from the CI runner.
     */
    protected JsonNode ripe(String endpoint, String resource) throws Exception {
        String body = rest().get()
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
