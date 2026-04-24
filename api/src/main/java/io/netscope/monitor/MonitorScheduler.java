package io.netscope.monitor;

import io.netscope.common.SafeHttpClient;
import io.netscope.common.TargetValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
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

    @Scheduled(fixedDelay = 30_000)
    public void tick() {
        for (Monitor m : monitors.findByEnabledTrue()) {
            String lockKey = "mon:lock:" + m.getId();
            Boolean acquired = redis.opsForValue().setIfAbsent(lockKey, "1", Duration.ofSeconds(m.getIntervalSec() - 5));
            if (Boolean.TRUE.equals(acquired)) {
                exec.submit(() -> runCheck(m));
            }
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
        String url = m.getTarget().startsWith("http") ? m.getTarget() : "https://" + m.getTarget();
        HttpResponse<Void> res = http.send(
            HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                .header("User-Agent", "NetScope-Monitor/1.0").GET().build(),
            HttpResponse.BodyHandlers.discarding());
        int ms = (int) (System.currentTimeMillis() - start);
        boolean up = res.statusCode() >= 200 && res.statusCode() < 400;
        checks.save(new MonitorCheck(m.getId(), up, ms, res.statusCode(), up ? null : "HTTP " + res.statusCode()));
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
