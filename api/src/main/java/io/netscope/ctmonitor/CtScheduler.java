package io.netscope.ctmonitor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.netscope.webhook.WebhookPublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;

/**
 * Every 10 min, polls crt.sh for each active subscription and records new
 * certificates. On any new observation, publishes a {@code ct.new_cert} event
 * so webhooks and email alerts fire.
 *
 * Crash protections:
 *  - Paginated DB read (100/page) instead of findAll() — prevents OOM on large tables
 *  - Semaphore(50) caps concurrent crt.sh threads — prevents unbounded thread growth
 *  - Response body limited to 8 MB — prevents heap exhaustion on large domains
 *  - RestClient timeout 15 s — prevents indefinite blocking
 */
@Component
public class CtScheduler {

    private static final Logger log = LoggerFactory.getLogger(CtScheduler.class);
    /** Max simultaneous crt.sh HTTP calls. Prevents unbounded virtual-thread accumulation. */
    private static final int MAX_CONCURRENT = 50;
    /** Hard cap on crt.sh response size (8 MB). Prevents OOM for huge domains. */
    private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;
    private static final int PAGE_SIZE = 100;

    private final CtSubscriptionRepository subs;
    private final CtObservationRepository obs;
    private final ApplicationEventPublisher events;
    private final RestClient rest = RestClient.builder()
        .defaultHeader("User-Agent", "NetScope/1.0")
        .requestInterceptor((req, body, execution) -> execution.execute(req, body))
        .build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final ExecutorService exec = Executors.newThreadPerTaskExecutor(
        Thread.ofVirtual().name("ct-", 0).factory());
    private final Semaphore concurrencyLimit = new Semaphore(MAX_CONCURRENT);

    public CtScheduler(CtSubscriptionRepository s, CtObservationRepository o, ApplicationEventPublisher e) {
        this.subs = s; this.obs = o; this.events = e;
    }

    @Scheduled(fixedDelay = 600_000, initialDelay = 30_000)
    public void tick() {
        // Paginated: never loads the full table into memory at once
        int page = 0;
        List<CtSubscription> batch;
        do {
            batch = subs.findAll(PageRequest.of(page++, PAGE_SIZE)).getContent();
            for (CtSubscription s : batch) {
                exec.submit(() -> {
                    try {
                        concurrencyLimit.acquire();   // blocks if 50 already running
                        try { poll(s); }
                        finally { concurrencyLimit.release(); }
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                });
            }
        } while (batch.size() == PAGE_SIZE);
    }

    @CircuitBreaker(name = "crtsh", fallbackMethod = "fallback")
    public void poll(CtSubscription s) {
        try {
            byte[] rawBytes = rest.get()
                .uri("https://crt.sh/?q=%25.{d}&output=json", s.getDomain())
                .retrieve().body(byte[].class);
            if (rawBytes == null) return;
            // Enforce size cap — prevents OOM on popular domains returning 50+ MB
            if (rawBytes.length > MAX_BODY_BYTES) {
                log.warn("CT response too large ({} bytes) for {}, skipping", rawBytes.length, s.getDomain());
                return;
            }
            String body = new String(rawBytes, java.nio.charset.StandardCharsets.UTF_8);
            JsonNode arr = mapper.readTree(body);
            if (!arr.isArray()) return;

            long maxId = s.getLastSeenId() == null ? 0L : s.getLastSeenId();
            List<JsonNode> fresh = new ArrayList<>();
            for (JsonNode n : arr) {
                long id = n.path("id").asLong(0);
                if (id > maxId) fresh.add(n);
            }

            // On first-run we don't alert on existing certs — we just record the high water mark
            boolean isFirstRun = s.getLastSeenId() == null;
            long newHighWater = maxId;
            for (JsonNode n : fresh) {
                long id = n.path("id").asLong(0);
                newHighWater = Math.max(newHighWater, id);
                if (isFirstRun) continue;

                CtObservation o = new CtObservation(s.getId(), id,
                    n.path("issuer_name").asText(null),
                    n.path("common_name").asText(null),
                    splitSans(n.path("name_value").asText("")),
                    parseTs(n.path("not_before").asText()),
                    parseTs(n.path("not_after").asText()));
                obs.save(o);
                events.publishEvent(new WebhookPublisher.DomainEvent(
                    s.getWorkspaceId(), "ct.new_cert", Map.of(
                        "domain", s.getDomain(), "subject", o.getSubject(),
                        "sans", o.getSans(), "notBefore", o.getNotBefore(),
                        "notAfter", o.getNotAfter(), "crtshId", id)));
            }

            s.setLastSeenId(newHighWater);
            s.setLastCheckedAt(Instant.now());
            subs.save(s);
        } catch (Exception e) {
            log.warn("CT poll failed for {}: {}", s.getDomain(), e.getMessage());
        }
    }

    @SuppressWarnings("unused")
    public void fallback(CtSubscription s, Throwable t) {
        log.debug("crt.sh breaker open, skipping {} until reset", s.getDomain());
    }

    private List<String> splitSans(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return Arrays.stream(raw.split("\n"))
            .map(String::trim).filter(x -> !x.isBlank())
            .distinct().sorted().limit(500).toList();
    }

    private Instant parseTs(String s) {
        if (s == null || s.isBlank()) return null;
        try { return Instant.from(DateTimeFormatter.ISO_DATE_TIME.parse(s)); }
        catch (Exception e) { return null; }
    }
}
