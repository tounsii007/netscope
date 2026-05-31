package io.netscope.ip;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.client.JdkClientHttpRequestFactory;
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

    /**
     * F-RD2-03: hard cap on the ipinfo.io response body. The endpoint
     * is documented to return ~1 KB JSON; anything an order of
     * magnitude larger is either a misbehaving upstream, an attacker
     * proxying through a compromised CDN, or a hijacked DNS pointing
     * us at a tarpit. Reject before we deserialise.
     */
    private static final long MAX_IPINFO_BODY_BYTES = 256L * 1024L;

    private final StringRedisTemplate redis;
    private final ObjectMapper mapper = new ObjectMapper();
    /**
     * F-RD2-03: previously {@code RestClient.create()} — the default
     * factory honours no connect/read timeouts, so an ipinfo.io hang
     * would pin the calling HTTP worker indefinitely. Resilience4j's
     * {@code @TimeLimiter} only works on async return types, so the
     * sync {@code @CircuitBreaker} path here MUST enforce its own
     * deadlines at the transport layer. 5 s each is well above the
     * p99 latency from any AWS region and well below the breaker
     * sliding-window failure-rate window.
     */
    private final RestClient rest = buildIpinfoRestClient();
    private final HttpClient http = HttpClient.newHttpClient();

    private static RestClient buildIpinfoRestClient() {
        HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
        var rf = new JdkClientHttpRequestFactory(httpClient);
        rf.setReadTimeout(Duration.ofSeconds(5));
        return RestClient.builder()
            .requestFactory(rf)
            .defaultHeader("User-Agent", "NetScope/1.0 (ip-geo-lookup)")
            .defaultHeader("Accept", "application/json")
            .build();
    }

    @Value("${netscope.geoip.ipinfo-token:}")
    private String ipinfoToken;

    /**
     * Base URL for the ipinfo.io GeoIP API. Configurable so integration
     * tests can point this at a WireMock instance instead of the real
     * external service — without that override, {@code @CircuitBreaker}
     * tests on CI runners with internet access can't actually
     * exercise the failure path.
     */
    @Value("${netscope.geoip.ipinfo-base-url:https://ipinfo.io}")
    private String ipinfoBaseUrl;

    @Value("${netscope.tor.exit-list-url}")
    private String torListUrl;

    private final Set<String> torExits = ConcurrentHashMap.newKeySet();
    private volatile long torExitsLoadedAt = 0;
    /** Set to true while a refresh is in flight; prevents thundering-herd
     *  refresh attempts when many requests arrive at the TTL boundary. */
    private final java.util.concurrent.atomic.AtomicBoolean torRefreshInFlight =
        new java.util.concurrent.atomic.AtomicBoolean(false);

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

    /**
     * Look up GeoIP via ipinfo.io. Exceptions deliberately propagate so
     * Resilience4j's @CircuitBreaker can:
     *   1. count them toward the failure-rate threshold and trip the
     *      breaker after enough consecutive failures, and
     *   2. route them to {@link #fetchFallback}, which returns a uniform
     *      "degraded" response shape the caller already handles.
     *
     * Previously this method swallowed every exception and returned a
     * Map with an "error" key. That hid all failures from the breaker
     * (it never opened) AND created a second response shape the rest of
     * the pipeline never expected — F-grade bug masked as defensive
     * programming.
     */
    // F-RD2-03 compromise: keep the synchronous return type so the
    // existing callers (IpService.lookup + IpServiceCircuitBreakerTest)
    // don't need rewriting. @TimeLimiter only fires on a
    // CompletionStage-returning method, so instead we enforce the
    // 5 s deadline at the HTTP transport layer (see {@link
    // #buildIpinfoRestClient}) and bound the response body before
    // parsing. The CircuitBreaker still trips on transport-timeout
    // exceptions thrown from .retrieve().
    @CircuitBreaker(name = "ipinfo", fallbackMethod = "fetchFallback")
    public Map<String, Object> fetchFromIpinfo(String ip) {
        try {
            String url = ipinfoBaseUrl + "/" + ip + "/json"
                + (ipinfoToken.isBlank() ? "" : "?token=" + ipinfoToken);
            // F-RD2-03: fetch as ResponseEntity<byte[]> so we can
            // (a) check Content-Length upfront and short-circuit on
            // oversized payloads without buffering them, and
            // (b) reject the actual returned body if the server
            // either omitted Content-Length or lied about it.
            var entity = rest.get().uri(url).retrieve().toEntity(byte[].class);
            long declared = entity.getHeaders().getContentLength();
            if (declared > MAX_IPINFO_BODY_BYTES) {
                throw new RuntimeException(
                    "geoip response too large: " + declared + " bytes");
            }
            byte[] raw = entity.getBody();
            if (raw == null || raw.length == 0) {
                throw new RuntimeException("geoip response empty");
            }
            if (raw.length > MAX_IPINFO_BODY_BYTES) {
                throw new RuntimeException(
                    "geoip response too large: " + raw.length + " bytes");
            }
            JsonNode j = mapper.readTree(raw);
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
            // Re-throw as RuntimeException so Resilience4j's @CircuitBreaker
            // sees the failure: it counts toward the breaker's failure-rate
            // threshold AND routes through fetchFallback for the user-visible
            // response. The previous catch returned a Map locally, which
            // hid every error from the breaker (it never opened in
            // practice) and produced a second "error" response shape the
            // pipeline didn't expect. Method signature stays unchanged so
            // every caller continues to compile.
            throw new RuntimeException("geoip lookup failed: " + e.getMessage(), e);
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

    /**
     * Trigger a Tor exit-list refresh if the cached list is stale.
     * Non-blocking: the actual HTTP fetch runs on a separate thread,
     * so a slow refresh never holds up the IP lookup that triggered
     * it. The current request continues using whatever entries were
     * already cached. Once the refresh lands, subsequent lookups see
     * the updated set.
     *
     * Thundering-herd guard: AtomicBoolean ensures only one refresh
     * is in flight at a time. Without it, every concurrent request
     * arriving at the 1-hour TTL boundary would each kick off its
     * own HTTP fetch.
     *
     * On the very first call after startup `torExits` is empty and
     * we still return immediately — proxy-flag enrichment treats an
     * empty set as "tor: false". Conservative bias; we'd rather
     * under-flag than block on a startup network round-trip.
     */
    private void loadTorList() {
        if (System.currentTimeMillis() - torExitsLoadedAt < 3600_000) return;
        if (!torRefreshInFlight.compareAndSet(false, true)) return;

        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                HttpResponse<String> res = http.send(
                    HttpRequest.newBuilder(URI.create(torListUrl)).timeout(Duration.ofSeconds(10)).build(),
                    HttpResponse.BodyHandlers.ofString());
                Set<String> fresh = ConcurrentHashMap.newKeySet();
                for (String line : res.body().split("\n")) {
                    if (!line.isBlank()) fresh.add(line.trim());
                }
                // Atomic swap: clear-then-add could leave a window where
                // a concurrent reader sees no entries. addAll-then-retainAll
                // is the closest we can do without copy-on-write semantics.
                torExits.addAll(fresh);
                torExits.retainAll(fresh);
                torExitsLoadedAt = System.currentTimeMillis();
            } catch (Exception ignored) {
                // Swallow — keep the old cached list; we'll try again
                // on the next request after the TTL window.
            } finally {
                torRefreshInFlight.set(false);
            }
        });
    }

}
