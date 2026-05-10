package io.netscope.ip;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class IpService {

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient rest = RestClient.create();
    private final HttpClient http = HttpClient.newHttpClient();

    @Value("${netscope.geoip.ipinfo-token:}")
    private String ipinfoToken;

    @Value("${netscope.tor.exit-list-url}")
    private String torListUrl;

    private final Set<String> torExits = ConcurrentHashMap.newKeySet();
    private volatile long torExitsLoadedAt = 0;

    public IpService(StringRedisTemplate redis) { this.redis = redis; }

    public Map<String, Object> lookup(String ip) {
        InetAddress addr = IpAddressGuard.parseAndGuard(ip);
        // Normalise to the canonical string form (handles 0-padding,
        // leading zeros, IPv4-mapped IPv6 etc.) so the cache key is
        // stable regardless of how the user spelled the address.
        String canonical = addr.getHostAddress();

        String cached = redis.opsForValue().get("ip:" + canonical);
        if (cached != null) {
            try { return mapper.readValue(cached, Map.class); } catch (Exception ignored) {}
        }

        Map<String, Object> result = fetchFromIpinfo(canonical);
        enrichProxyFlags(canonical, result);
        enrichTechnical(addr, result);

        try {
            redis.opsForValue().set("ip:" + canonical, mapper.writeValueAsString(result), Duration.ofHours(12));
        } catch (Exception ignored) {}

        return result;
    }

    /**
     * Extra lookup fields that don't depend on a third-party geo
     * provider — IP version, address class, reverse DNS, byte-level
     * canonical form. These let the UI populate every detail panel on
     * its own without separate round-trips.
     */
    private void enrichTechnical(InetAddress addr, Map<String, Object> out) {
        if (addr instanceof Inet4Address) {
            out.put("version", 4);
            out.put("addressClass", ipv4Class(addr.getAddress()));
        } else if (addr instanceof Inet6Address) {
            out.put("version", 6);
        }
        // Reverse DNS — bounded so a hostile PTR server can't pin a thread.
        try {
            String reverse = lookupReverseDnsBounded(addr);
            if (reverse != null) out.put("reverseDns", reverse);
        } catch (Exception ignored) { /* best-effort */ }
    }

    private static String ipv4Class(byte[] raw) {
        int first = raw[0] & 0xff;
        if (first <= 127) return "A";
        if (first <= 191) return "B";
        if (first <= 223) return "C";
        if (first <= 239) return "D (multicast)";
        return "E (reserved)";
    }

    /**
     * Reverse DNS with a hard 1.5 s timeout. Java's built-in
     * {@code InetAddress.getCanonicalHostName()} blocks indefinitely on
     * a tarpit nameserver and would tie up an HTTP worker. Wrapping it
     * in a separate thread + {@code orTimeout} guarantees we return
     * promptly even when the remote PTR server misbehaves.
     */
    private String lookupReverseDnsBounded(InetAddress addr) {
        var fut = java.util.concurrent.CompletableFuture.supplyAsync(() -> {
            String name = addr.getCanonicalHostName();
            return name.equals(addr.getHostAddress()) ? null : name;
        });
        try {
            return fut.orTimeout(1500, java.util.concurrent.TimeUnit.MILLISECONDS).get();
        } catch (Exception e) {
            fut.cancel(true);
            return null;
        }
    }

    @CircuitBreaker(name = "ipinfo", fallbackMethod = "fetchFallback")
    public Map<String, Object> fetchFromIpinfo(String ip) {
        try {
            String url = "https://ipinfo.io/" + ip + "/json"
                + (ipinfoToken.isBlank() ? "" : "?token=" + ipinfoToken);
            String body = rest.get().uri(url).retrieve().body(String.class);
            JsonNode j = mapper.readTree(body);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ip", ip);
            out.put("hostname", j.path("hostname").asText(null));
            out.put("city", j.path("city").asText(null));
            out.put("region", j.path("region").asText(null));
            out.put("country", j.path("country").asText(null));
            out.put("org", j.path("org").asText(null));
            out.put("timezone", j.path("timezone").asText(null));
            String[] loc = j.path("loc").asText("").split(",");
            if (loc.length == 2) {
                out.put("lat", Double.parseDouble(loc[0]));
                out.put("lon", Double.parseDouble(loc[1]));
            }
            String org = j.path("org").asText("");
            if (org.startsWith("AS")) {
                int sp = org.indexOf(' ');
                if (sp > 0) {
                    out.put("asn", org.substring(0, sp));
                    out.put("isp", org.substring(sp + 1));
                }
            }
            return out;
        } catch (Exception e) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ip", ip);
            out.put("error", "geoip lookup failed: " + e.getMessage());
            return out;
        }
    }

    @SuppressWarnings("unused")
    private Map<String, Object> fetchFallback(String ip, Throwable t) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ip", ip);
        out.put("degraded", true);
        out.put("reason", "upstream unavailable");
        return out;
    }

    private void enrichProxyFlags(String ip, Map<String, Object> out) {
        loadTorList();
        boolean tor = torExits.contains(ip);
        String org = String.valueOf(out.getOrDefault("org", "")).toLowerCase();
        boolean hosting = org.matches(".*(amazon|google|microsoft|digitalocean|ovh|hetzner|linode|vultr|cloudflare).*");
        int risk = 0;
        if (tor) risk += 80;
        if (hosting) risk += 40;

        Map<String, Object> flags = new LinkedHashMap<>();
        flags.put("tor", tor);
        flags.put("hosting", hosting);
        flags.put("vpn", false);
        flags.put("proxy", false);
        flags.put("residential", !hosting && !tor);
        flags.put("riskScore", Math.min(risk, 100));
        out.put("threat", flags);
    }

    private synchronized void loadTorList() {
        if (System.currentTimeMillis() - torExitsLoadedAt < 3600_000) return;
        try {
            HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create(torListUrl)).timeout(Duration.ofSeconds(10)).build(),
                HttpResponse.BodyHandlers.ofString());
            torExits.clear();
            for (String line : res.body().split("\n")) {
                if (!line.isBlank()) torExits.add(line.trim());
            }
            torExitsLoadedAt = System.currentTimeMillis();
        } catch (Exception ignored) {}
    }

}
