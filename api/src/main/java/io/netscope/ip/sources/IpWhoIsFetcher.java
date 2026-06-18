package io.netscope.ip.sources;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

import static io.netscope.ip.sources.IpSourceFields.put;

/**
 * ipwho.is — generous limits, no key, returns flag URLs and
 * connection type (residential/business/hosting), continent.
 */
public final class IpWhoIsFetcher implements IpSourceFetcher {
    private final RestClient rc;
    private final ObjectMapper m;

    public IpWhoIsFetcher(RestClient rc, ObjectMapper m) { this.rc = rc; this.m = m; }

    @Override public String name() { return "ipwho.is"; }
    @Override public String url(String ip) { return "https://ipwho.is/" + ip; }

    @Override public Map<String, Object> fetch(String ip) throws Exception {
        String body = rc.get().uri(url(ip)).retrieve().body(String.class);
        JsonNode j = m.readTree(body);
        if (!j.path("success").asBoolean(true)) {
            throw new RuntimeException(j.path("message").asText("ipwho.is error"));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        put(out, "ip", j.path("ip").asText(null));
        put(out, "type", j.path("type").asText(null)); // IPv4 / IPv6
        put(out, "city", j.path("city").asText(null));
        put(out, "region", j.path("region").asText(null));
        put(out, "country", j.path("country_code").asText(null));
        put(out, "country_name", j.path("country").asText(null));
        put(out, "continent", j.path("continent").asText(null));
        put(out, "postal", j.path("postal").asText(null));
        put(out, "calling_code", j.path("calling_code").asText(null));
        put(out, "is_eu", j.path("is_eu").asBoolean());
        if (j.has("latitude")) out.put("lat", j.path("latitude").asDouble());
        if (j.has("longitude")) out.put("lon", j.path("longitude").asDouble());
        JsonNode tz = j.path("timezone");
        put(out, "timezone", tz.path("id").asText(null));
        JsonNode conn = j.path("connection");
        put(out, "asn", conn.has("asn") ? "AS" + conn.path("asn").asText("") : null);
        put(out, "isp", conn.path("isp").asText(null));
        put(out, "org", conn.path("org").asText(null));
        put(out, "domain", conn.path("domain").asText(null));
        JsonNode flag = j.path("flag");
        put(out, "flag_emoji", flag.path("emoji").asText(null));
        put(out, "flag_img", flag.path("img").asText(null));
        return out;
    }
}
