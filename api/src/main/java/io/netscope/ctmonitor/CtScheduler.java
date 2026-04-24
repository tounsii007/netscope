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

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Every 10 min, polls crt.sh for each active subscription and records new
 * certificates. On any new observation, publishes a {@code ct.new_cert} event
 * so webhooks and email alerts fire.
 */
@Component
public class CtScheduler {

    private static final Logger log = LoggerFactory.getLogger(CtScheduler.class);

    private final CtSubscriptionRepository subs;
    private final CtObservationRepository obs;
    private final ApplicationEventPublisher events;
    private final RestClient rest = RestClient.builder()
        .defaultHeader("User-Agent", "NetScope/1.0").build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final ExecutorService exec = Executors.newThreadPerTaskExecutor(
        Thread.ofVirtual().name("ct-", 0).factory());

    public CtScheduler(CtSubscriptionRepository s, CtObservationRepository o, ApplicationEventPublisher e) {
        this.subs = s; this.obs = o; this.events = e;
    }

    @Scheduled(fixedDelay = 600_000, initialDelay = 30_000)
    public void tick() {
        for (CtSubscription s : subs.findAll()) exec.submit(() -> poll(s));
    }

    @CircuitBreaker(name = "crtsh", fallbackMethod = "fallback")
    public void poll(CtSubscription s) {
        try {
            String body = rest.get()
                .uri("https://crt.sh/?q=%25.{d}&output=json", s.getDomain())
                .retrieve().body(String.class);
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
