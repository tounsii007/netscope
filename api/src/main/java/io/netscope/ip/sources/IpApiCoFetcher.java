package io.netscope.ip.sources;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

import static io.netscope.ip.sources.IpSourceFields.put;

/**
 * ipapi.co — 1k/day free, very rich data: ASN, ASN-org, currency,
 * calling code, language, country flag emoji, in-EU flag.
 */
public final class IpApiCoFetcher implements IpSourceFetcher {
    private final RestClient rc;
    private final ObjectMapper m;

    public IpApiCoFetcher(RestClient rc, ObjectMapper m) { this.rc = rc; this.m = m; }

    @Override public String name() { return "ipapi.co"; }
    @Override public String url(String ip) { return "https://ipapi.co/" + ip + "/json/"; }

    @Override public Map<String, Object> fetch(String ip) throws Exception {
        String body = rc.get().uri(url(ip)).retrieve().body(String.class);
        JsonNode j = m.readTree(body);
        // ipapi.co returns 200 with {"error": true, "reason": "…"} on rate-limit.
        if (j.path("error").asBoolean(false)) {
            throw new RuntimeException(j.path("reason").asText("ipapi.co error"));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        put(out, "ip", j.path("ip").asText(null));
        put(out, "city", j.path("city").asText(null));
        put(out, "region", j.path("region").asText(null));
        put(out, "country", j.path("country_code").asText(null));
        put(out, "country_name", j.path("country_name").asText(null));
        put(out, "postal", j.path("postal").asText(null));
        put(out, "timezone", j.path("timezone").asText(null));
        put(out, "asn", j.path("asn").asText(null));
        put(out, "org", j.path("org").asText(null));
        put(out, "isp", j.path("org").asText(null));
        put(out, "currency", j.path("currency").asText(null));
        put(out, "calling_code", j.path("country_calling_code").asText(null));
        put(out, "languages", j.path("languages").asText(null));
        put(out, "in_eu", j.path("in_eu").asBoolean());
        if (j.has("latitude")) out.put("lat", j.path("latitude").asDouble());
        if (j.has("longitude")) out.put("lon", j.path("longitude").asDouble());
        return out;
    }
}
