package io.netscope.ip.sources;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

import static io.netscope.ip.sources.IpSourceFields.put;

/** db-ip.com free API: 1000/day per IP, includes accuracy hint + EU flag. */
public final class DbIpFetcher implements IpSourceFetcher {
    private final RestClient rc;
    private final ObjectMapper m;

    public DbIpFetcher(RestClient rc, ObjectMapper m) { this.rc = rc; this.m = m; }

    @Override public String name() { return "db-ip.com"; }
    @Override public String url(String ip) { return "https://api.db-ip.com/v2/free/" + ip; }

    @Override public Map<String, Object> fetch(String ip) throws Exception {
        String body = rc.get().uri(url(ip)).retrieve().body(String.class);
        JsonNode j = m.readTree(body);
        if (j.has("error")) throw new RuntimeException(j.path("error").asText());
        Map<String, Object> out = new LinkedHashMap<>();
        put(out, "ip", j.path("ipAddress").asText(null));
        put(out, "city", j.path("city").asText(null));
        put(out, "region", j.path("stateProv").asText(null));
        put(out, "country", j.path("countryCode").asText(null));
        put(out, "country_name", j.path("countryName").asText(null));
        put(out, "continent", j.path("continentCode").asText(null));
        return out;
    }
}
