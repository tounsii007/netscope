package io.netscope.ip.sources;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

import static io.netscope.ip.sources.IpSourceFields.put;

/**
 * ipinfo.io — most popular free service. With a token: 50k/mo.
 * Without: 1k/day. Returns city/region/country/loc/org/timezone/postal.
 */
public final class IpInfoFetcher implements IpSourceFetcher {
    private final RestClient rc;
    private final ObjectMapper m;
    private final String token;

    public IpInfoFetcher(RestClient rc, ObjectMapper m, String token) {
        this.rc = rc; this.m = m; this.token = token;
    }

    @Override public String name() { return "ipinfo.io"; }
    @Override public String url(String ip) { return "https://ipinfo.io/" + ip + "/json"; }

    @Override public Map<String, Object> fetch(String ip) throws Exception {
        String u = url(ip) + (token == null || token.isBlank() ? "" : "?token=" + token);
        String body = rc.get().uri(u).retrieve().body(String.class);
        JsonNode j = m.readTree(body);
        Map<String, Object> out = new LinkedHashMap<>();
        put(out, "ip", j.path("ip").asText(null));
        put(out, "hostname", j.path("hostname").asText(null));
        put(out, "city", j.path("city").asText(null));
        put(out, "region", j.path("region").asText(null));
        put(out, "country", j.path("country").asText(null));
        put(out, "postal", j.path("postal").asText(null));
        put(out, "timezone", j.path("timezone").asText(null));
        put(out, "org", j.path("org").asText(null));
        String[] loc = j.path("loc").asText("").split(",");
        if (loc.length == 2) {
            try {
                out.put("lat", Double.parseDouble(loc[0]));
                out.put("lon", Double.parseDouble(loc[1]));
            } catch (NumberFormatException ignored) {}
        }
        String org = j.path("org").asText("");
        if (org.startsWith("AS")) {
            int sp = org.indexOf(' ');
            if (sp > 0) {
                put(out, "asn", org.substring(0, sp));
                put(out, "isp", org.substring(sp + 1));
            }
        }
        return out;
    }
}
