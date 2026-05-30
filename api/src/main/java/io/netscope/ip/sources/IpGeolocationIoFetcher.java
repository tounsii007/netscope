package io.netscope.ip.sources;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

import static io.netscope.ip.sources.IpSourceFields.put;

/**
 * IPGeolocation.io — paid sources tier. Skipped by the registry if no
 * API key is configured. Free tier: 1k/day, includes timezone,
 * currency, security flags.
 */
public final class IpGeolocationIoFetcher implements IpSourceFetcher {
    private final RestClient rc;
    private final ObjectMapper m;
    private final String key;

    public IpGeolocationIoFetcher(RestClient rc, ObjectMapper m, String key) {
        this.rc = rc; this.m = m; this.key = key;
    }

    @Override public String name() { return "ipgeolocation.io"; }
    @Override public String url(String ip) {
        return "https://api.ipgeolocation.io/ipgeo?apiKey=" + key + "&ip=" + ip;
    }

    @Override public Map<String, Object> fetch(String ip) throws Exception {
        String body = rc.get().uri(url(ip)).retrieve().body(String.class);
        JsonNode j = m.readTree(body);
        Map<String, Object> out = new LinkedHashMap<>();
        put(out, "ip", j.path("ip").asText(null));
        put(out, "city", j.path("city").asText(null));
        put(out, "region", j.path("state_prov").asText(null));
        put(out, "country", j.path("country_code2").asText(null));
        put(out, "country_name", j.path("country_name").asText(null));
        put(out, "continent", j.path("continent_code").asText(null));
        put(out, "postal", j.path("zipcode").asText(null));
        if (j.has("latitude")) out.put("lat", j.path("latitude").asDouble());
        if (j.has("longitude")) out.put("lon", j.path("longitude").asDouble());
        put(out, "isp", j.path("isp").asText(null));
        put(out, "org", j.path("organization").asText(null));
        put(out, "currency", j.path("currency").path("code").asText(null));
        put(out, "calling_code", j.path("calling_code").asText(null));
        JsonNode tz = j.path("time_zone");
        put(out, "timezone", tz.path("name").asText(null));
        return out;
    }
}
