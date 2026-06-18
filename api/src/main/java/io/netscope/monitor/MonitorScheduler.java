package io.netscope.monitor;

import io.netscope.common.http.HttpUrlNormaliser;
import io.netscope.common.http.SafeHttpClient;
import io.netscope.common.security.TargetValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Runs every 30s, picks up every monitor whose interval has elapsed since the
 * last check (tracked in Redis), fans the checks out on virtual threads, and
 * writes the result into monitor_checks. Designed to be stateless so multiple
 * replicas can coexist — Redis key acquisition prevents double-runs.
 */
@Component
public class MonitorScheduler {

    private static final Logger log = LoggerFactory.getLogger(MonitorScheduler.class);

    static {
        // F-RD4-07 DNS-rebinding defence: httpCheck() sets an explicit Host
        // header so the upstream still routes to the correct virtual host
        // after we rewrite the URI to the validated IP literal. JDK's
        // HttpClient blocks "Host" as a "restricted" header unless this
        // system property opts in. Must be set before the first time the
        // shared HttpClient sees a request that carries the header.
        String existing = System.getProperty("jdk.httpclient.allowRestrictedHeaders", "");
        if (!existing.toLowerCase().contains("host")) {
            String merged = existing.isBlank() ? "host" : existing + ",host";
            System.setProperty("jdk.httpclient.allowRestrictedHeaders", merged);
        }
    }

    private final MonitorRepository monitors;
    private final MonitorCheckRepository checks;
    private final SafeHttpClient http;
    private final TargetValidator validator;
    private final StringRedisTemplate redis;
    private final ExecutorService exec = Executors.newVirtualThreadPerTaskExecutor();

    public MonitorScheduler(MonitorRepository monitors, MonitorCheckRepository checks,
                            SafeHttpClient http, TargetValidator validator, StringRedisTemplate redis) {
        this.monitors = monitors; this.checks = checks; this.http = http;
        this.validator = validator; this.redis = redis;
    }

    /** Page size for the scheduler walk. 500 keeps each iteration's
     *  memory footprint bounded but processes the whole table within a
     *  few ticks even at 100k+ rows. */
    private static final int SCHED_PAGE_SIZE = 500;

    /** Buffer subtracted from the monitor's intervalSec to compute the Redis
     *  setIfAbsent TTL. Lets the next tick re-acquire the lock just before
     *  the previous run's TTL expires, instead of racing the boundary. */
    private static final int LOCK_TTL_BUFFER_SECONDS = 5;

    /** Per-check HTTP request timeout. 10 s matches HeadersController +
     *  RobotsController so a monitored HTTP target gets the same response-
     *  window everywhere. */
    private static final Duration HTTP_CHECK_TIMEOUT = Duration.ofSeconds(10);

    @Scheduled(fixedDelay = 30_000)
    public void tick() {
        // Page through enabled monitors instead of loading the whole
        // table into memory. Previously findByEnabledTrue() materialised
        // every enabled row as a List on every 30 s tick — at 100k
        // monitors that's multi-MB allocations + serialised lock-
        // acquire loop inside one virtual thread. Per-monitor lock-
        // acquire short-circuits monitors that aren't due yet (the
        // setIfAbsent TTL is the interval), so visiting in fixed
        // pages doesn't slow the schedule materially.
        int page = 0;
        while (true) {
            var pageable = org.springframework.data.domain.PageRequest.of(page, SCHED_PAGE_SIZE);
            List<Monitor> batch = monitors.findEnabledPage(pageable);
            if (batch.isEmpty()) break;
            for (Monitor m : batch) {
                String lockKey = "mon:lock:" + m.getId();
                Boolean acquired = redis.opsForValue().setIfAbsent(lockKey, "1",
                    Duration.ofSeconds(m.getIntervalSec() - LOCK_TTL_BUFFER_SECONDS));
                if (Boolean.TRUE.equals(acquired)) {
                    exec.submit(() -> runCheck(m));
                }
            }
            if (batch.size() < SCHED_PAGE_SIZE) break;
            page++;
        }
    }

    private void runCheck(Monitor m) {
        long start = System.currentTimeMillis();
        try {
            switch (m.getType()) {
                case "http" -> httpCheck(m, start);
                case "tcp" -> tcpCheck(m, start);
                case "ping" -> pingCheck(m, start);
                default -> saveFailure(m, "unknown type: " + m.getType());
            }
        } catch (Exception e) {
            saveFailure(m, e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void httpCheck(Monitor m, long start) throws Exception {
        String url = HttpUrlNormaliser.ensureHttpScheme(m.getTarget());
        URI original = URI.create(url);
        String host = original.getHost();
        if (host == null) {
            saveFailure(m, "url missing host: " + url);
            return;
        }
        // F-RD4-07: close the DNS-rebinding TOCTOU window between this
        // scheduler tick and the HttpClient's connect-time resolution.
        // resolveAndValidate() vouches for the InetAddress; we then dial
        // that IP literal directly so the JDK skips the second DNS
        // lookup. A low-TTL attacker resolver could otherwise return a
        // public IP on lookup #1 (passes validate) and 127.0.0.1 /
        // 169.254.169.254 on lookup #2 (the socket would target the
        // loopback / cloud-metadata service and persist the result in
        // monitor_checks for sustained recon). The original hostname is
        // restored via the Host header so vhost routing / TLS SNI
        // upstream still works.
        InetAddress addr = validator.resolveAndValidate(host);
        URI pinned = pinHostToAddress(original, addr);
        String hostHeader = hostHeaderValue(original);
        HttpResponse<Void> res = http.send(
            HttpRequest.newBuilder(pinned).timeout(HTTP_CHECK_TIMEOUT)
                .header("User-Agent", "NetScope-Monitor/1.0")
                .header("Host", hostHeader)
                .GET().build(),
            HttpResponse.BodyHandlers.discarding());
        int ms = (int) (System.currentTimeMillis() - start);
        boolean up = res.statusCode() >= 200 && res.statusCode() < 400;
        checks.save(new MonitorCheck(m.getId(), up, ms, res.statusCode(), up ? null : "HTTP " + res.statusCode()));
    }

    /**
     * F-RD4-07: replace the hostname in {@code original} with the literal
     * IP form of {@code addr}, preserving scheme, port, path, query, and
     * fragment. IPv6 literals are bracketed per RFC 3986 §3.2.2 and any
     * zone-id ("%eth0") is stripped — it's meaningless across hosts and
     * breaks URI parsing.
     */
    private static URI pinHostToAddress(URI original, InetAddress addr) throws URISyntaxException {
        String literal = addr.getHostAddress();
        if (addr instanceof Inet6Address) {
            int pct = literal.indexOf('%');
            if (pct >= 0) literal = literal.substring(0, pct);
            literal = "[" + literal + "]";
        }
        StringBuilder authority = new StringBuilder();
        if (original.getRawUserInfo() != null) {
            authority.append(original.getRawUserInfo()).append('@');
        }
        authority.append(literal);
        if (original.getPort() != -1) {
            authority.append(':').append(original.getPort());
        }
        StringBuilder out = new StringBuilder();
        out.append(original.getScheme()).append("://").append(authority);
        String rawPath = original.getRawPath();
        String rawQuery = original.getRawQuery();
        String rawFragment = original.getRawFragment();
        if (rawPath != null && !rawPath.isEmpty()) out.append(rawPath);
        if (rawQuery != null) out.append('?').append(rawQuery);
        if (rawFragment != null) out.append('#').append(rawFragment);
        return new URI(out.toString());
    }

    /**
     * Builds the {@code Host} request header from the original URL so the
     * upstream server still routes by hostname (and TLS SNI / vhost
     * selection keeps working) after we pinned the URI to the IP literal.
     */
    private static String hostHeaderValue(URI original) {
        String host = original.getHost();
        int port = original.getPort();
        return port < 0 ? host : host + ":" + port;
    }

    private void tcpCheck(Monitor m, long start) throws Exception {
        InetAddress addr = validator.resolveAndValidate(m.getTarget());
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(addr, m.getPort() == null ? 443 : m.getPort()), 5000);
            int ms = (int) (System.currentTimeMillis() - start);
            checks.save(new MonitorCheck(m.getId(), true, ms, null, null));
        }
    }

    private void pingCheck(Monitor m, long start) throws Exception {
        InetAddress addr = validator.resolveAndValidate(m.getTarget());
        boolean reachable = addr.isReachable(5000);
        int ms = (int) (System.currentTimeMillis() - start);
        checks.save(new MonitorCheck(m.getId(), reachable, reachable ? ms : null, null,
            reachable ? null : "unreachable"));
    }

    private void saveFailure(Monitor m, String error) {
        checks.save(new MonitorCheck(m.getId(), false, null, null, error));
        log.info("monitor {} failed: {}", m.getId(), error);
    }
}
