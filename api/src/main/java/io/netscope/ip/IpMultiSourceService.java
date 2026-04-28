package io.netscope.ip;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

/**
 * Queries several free public geolocation APIs in parallel for the same IP
 * and aggregates their answers. The frontend displays one card per source so
 * the user can compare results — accuracy varies wildly between providers
 * (especially for residential IPs and CGNAT) and seeing the divergence is
 * the whole point.
 *
 * <h3>Sources (all free, no API key, all HTTPS)</h3>
 * <ul>
 *   <li><b>ipinfo.io</b> — well-known, free 50k/mo, accurate ASN data</li>
 *   <li><b>ipapi.co</b> — 1k/day, very detailed (ASN, currency, calling code)</li>
 *   <li><b>ipwho.is</b> — generous limits, includes EU flag, currency, calling code</li>
 *   <li><b>db-ip.com</b> — 1k/day per IP, includes accuracy hint</li>
 * </ul>
 *
 * <p>Each source has a hard 3-second timeout; one slow source must not stall
 * the aggregate response. Results are cached in Redis for 12 hours per IP.</p>
 *
 * <h3>Adding a new source</h3>
 * Implement a {@link SourceFetcher}, register it in {@link #fetchers()}.
 * The result is stored under {@code data} as a flat map of common fields the
 * frontend understands ({@code city, region, country, lat, lon, ...}) plus
 * any source-specific extras under their original keys.
 */
@Service
public class IpMultiSourceService {

    private static final Logger log = LoggerFactory.getLogger(IpMultiSourceService.class);

    /** Per-source HTTP timeout. Aggregate latency is dominated by the slowest source. */
    private static final Duration SOURCE_TIMEOUT = Duration.ofSeconds(3);

    /** Redis cache TTL — same as the single-source endpoint to stay coherent. */
    private static final Duration CACHE_TTL = Duration.ofHours(12);

    private final ObjectMapper mapper = new ObjectMapper();
    private final StringRedisTemplate redis;
    private final RestClient rest;
    private final ExecutorService executor;

    @Value("${netscope.geoip.ipinfo-token:}")
    private String ipinfoToken;

    @Value("${netscope.geoip.ipgeolocation-key:}")
    private String ipGeolocationKey;

    public IpMultiSourceService(StringRedisTemplate redis) {
        this.redis = redis;
        // JDK HttpClient with redirect-follow + HTTP/1.1 — same recipe that
        // fixed crt.sh on Java 26. Some geo-API CDNs (Cloudflare in front of
        // ipapi.co) reject Java's default HTTP/2 negotiation otherwise.
        HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .version(HttpClient.Version.HTTP_1_1)
            .build();
        var rf = new JdkClientHttpRequestFactory(httpClient);
        rf.setReadTimeout(SOURCE_TIMEOUT);
        this.rest = RestClient.builder()
            .requestFactory(rf)
            .defaultHeader("User-Agent", "NetScope/1.0 (geolocation-aggregator)")
            .defaultHeader("Accept", "application/json, */*")
            .build();

        // Bounded pool: we have ~5 sources, no point in more threads. Daemon
        // so JVM shutdown is clean.
        this.executor = Executors.newFixedThreadPool(8, r -> {
            Thread t = new Thread(r, "ip-multi-source");
            t.setDaemon(true);
            return t;
        });
    }

    /**
     * Aggregate query: dispatch every source in parallel, collect results
     * (success or failure) within {@link #SOURCE_TIMEOUT} per source, return
     * an ordered list so the frontend renders sources consistently.
     */
    public Map<String, Object> lookup(String ip) {
        if (!isValidIp(ip)) throw ApiException.badRequest("invalid IP");

        // Cache check
        String cacheKey = "ip-multi:" + ip;
        try {
            String cached = redis.opsForValue().get(cacheKey);
            if (cached != null) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> deser = mapper.readValue(cached, Map.class);
                    deser.put("cached", true);
                    return deser;
                } catch (Exception e) {
                    log.warn("[ip-multi] cache deserialize failed: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("[ip-multi] redis GET failed: {}", e.getMessage());
        }

        long start = System.currentTimeMillis();
        List<SourceFetcher> all = fetchers();

        // Dispatch every source in parallel.
        List<CompletableFuture<SourceResult>> futures = all.stream()
            .map(f -> CompletableFuture.supplyAsync(() -> runOne(f, ip), executor))
            .toList();

        // Wait for all (each has its own timeout already).
        List<SourceResult> results = futures.stream()
            .map(CompletableFuture::join)
            .toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ip", ip);
        out.put("durationMs", System.currentTimeMillis() - start);
        out.put("sources", results);
        out.put("sourceCount", results.size());
        out.put("successCount", results.stream().filter(r -> r.ok).count());

        // Best-effort cache
        try {
            redis.opsForValue().set(cacheKey, mapper.writeValueAsString(out), CACHE_TTL);
        } catch (Exception ignored) {
        }
        return out;
    }

    /** Run one source with logging + per-source timing. Never throws. */
    private SourceResult runOne(SourceFetcher f, String ip) {
        long t0 = System.currentTimeMillis();
        try {
            Map<String, Object> data = f.fetch(ip);
            return SourceResult.ok(f.name(), f.url(ip), data, System.currentTimeMillis() - t0);
        } catch (Exception e) {
            log.warn("[ip-multi] source '{}' failed: {} - {}",
                f.name(), e.getClass().getSimpleName(), e.getMessage());
            return SourceResult.fail(f.name(), f.url(ip),
                e.getClass().getSimpleName() + ": " + e.getMessage(),
                System.currentTimeMillis() - t0);
        }
    }

    /**
     * Registry of active sources. Sources requiring an API key skip themselves
     * silently when the key isn't configured (returns no fetcher).
     */
    private List<SourceFetcher> fetchers() {
        List<SourceFetcher> out = new ArrayList<>();
        out.add(new IpInfoFetcher(rest, mapper, ipinfoToken));
        out.add(new IpApiCoFetcher(rest, mapper));
        out.add(new IpWhoIsFetcher(rest, mapper));
        out.add(new DbIpFetcher(rest, mapper));
        if (ipGeolocationKey != null && !ipGeolocationKey.isBlank()) {
            out.add(new IpGeolocationIoFetcher(rest, mapper, ipGeolocationKey));
        }
        return out;
    }

    private static boolean isValidIp(String ip) {
        if (ip == null || ip.isBlank()) return false;
        // Lightweight check — full validation lives in IpService.
        return ip.matches("^[0-9a-fA-F:.]{2,45}$");
    }

    // ---------- types ----------

    /** One source's result, ok or failed. Serialised to JSON for the client. */
    public record SourceResult(
        String source,
        String url,
        boolean ok,
        long latencyMs,
        Map<String, Object> data,
        String error
    ) {
        static SourceResult ok(String n, String url, Map<String, Object> d, long ms) {
            return new SourceResult(n, url, true, ms, d, null);
        }
        static SourceResult fail(String n, String url, String err, long ms) {
            return new SourceResult(n, url, false, ms, null, err);
        }
    }

    /** Strategy interface for one geolocation source. */
    interface SourceFetcher {
        String name();
        String url(String ip);
        Map<String, Object> fetch(String ip) throws Exception;
    }

    // ---------- source implementations ----------

    /**
     * ipinfo.io — most popular free service. With a token: 50k/mo. Without:
     * 1k/day. Returns city/region/country/loc/org/timezone/postal.
     */
    static class IpInfoFetcher implements SourceFetcher {
        private final RestClient rc;
        private final ObjectMapper m;
        private final String token;
        IpInfoFetcher(RestClient rc, ObjectMapper m, String token) { this.rc = rc; this.m = m; this.token = token; }
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

    /**
     * ipapi.co — 1k/day free, very rich data: ASN, ASN-org, currency, calling
     * code, language, country flag emoji, in-EU flag.
     */
    static class IpApiCoFetcher implements SourceFetcher {
        private final RestClient rc;
        private final ObjectMapper m;
        IpApiCoFetcher(RestClient rc, ObjectMapper m) { this.rc = rc; this.m = m; }
        @Override public String name() { return "ipapi.co"; }
        @Override public String url(String ip) { return "https://ipapi.co/" + ip + "/json/"; }
        @Override public Map<String, Object> fetch(String ip) throws Exception {
            String body = rc.get().uri(url(ip)).retrieve().body(String.class);
            JsonNode j = m.readTree(body);
            // ipapi.co returns 200 with {"error": true, "reason": "..."} on rate-limit.
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

    /**
     * ipwho.is — generous limits, no key, returns flag URLs and connection
     * type (residential/business/hosting), continent.
     */
    static class IpWhoIsFetcher implements SourceFetcher {
        private final RestClient rc;
        private final ObjectMapper m;
        IpWhoIsFetcher(RestClient rc, ObjectMapper m) { this.rc = rc; this.m = m; }
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

    /**
     * db-ip.com free API: 1000/day per IP, includes accuracy hint, EU flag.
     */
    static class DbIpFetcher implements SourceFetcher {
        private final RestClient rc;
        private final ObjectMapper m;
        DbIpFetcher(RestClient rc, ObjectMapper m) { this.rc = rc; this.m = m; }
        @Override public String name() { return "db-ip.com"; }
        @Override public String url(String ip) { return "https://api.db-ip.com/v2/free/" + ip; }
        @Override public Map<String, Object> fetch(String ip) throws Exception {
            String body = rc.get().uri(url(ip)).retrieve().body(String.class);
            JsonNode j = m.readTree(body);
            if (j.has("error")) {
                throw new RuntimeException(j.path("error").asText());
            }
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

    /**
     * IPGeolocation.io — paid sources tier. Skipped if no API key configured.
     * Free tier: 1k/day, includes timezone, currency, security flags.
     */
    static class IpGeolocationIoFetcher implements SourceFetcher {
        private final RestClient rc;
        private final ObjectMapper m;
        private final String key;
        IpGeolocationIoFetcher(RestClient rc, ObjectMapper m, String key) { this.rc = rc; this.m = m; this.key = key; }
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

    /** Helper: skip null/blank/dash strings so the JSON output is clean. */
    private static void put(Map<String, Object> m, String key, Object value) {
        if (value == null) return;
        if (value instanceof String s && (s.isBlank() || "null".equals(s))) return;
        m.put(key, value);
    }
}
