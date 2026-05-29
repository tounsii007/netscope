package io.netscope.webhook;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.errors.ApiException;
import io.netscope.common.security.TargetValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;

/**
 * Picks up pending deliveries every 5 s and POSTs them in parallel on a virtual
 * thread pool. Retries with exponential backoff (1 m, 5 m, 30 m, 2 h, 6 h,
 * 24 h). After 6 failed attempts the delivery is marked dead and stops retrying.
 *
 * Crash protection:
 *  - Semaphore(200) caps concurrent in-flight HTTP calls — prevents unbounded
 *    virtual-thread accumulation when target endpoints are slow/unreachable.
 *    At 10 s timeout × 200 threads = max 200 concurrent blocked calls at any time.
 */
@Component
public class WebhookDeliveryWorker {

    private static final Logger log = LoggerFactory.getLogger(WebhookDeliveryWorker.class);
    private static final int MAX_ATTEMPTS = 6;
    /** Hard cap on concurrent outbound webhook POSTs. Prevents runaway thread accumulation. */
    private static final int MAX_CONCURRENT = 200;
    private static final Duration[] BACKOFF = {
        Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(30),
        Duration.ofHours(2), Duration.ofHours(6), Duration.ofHours(24)
    };

    private final WebhookDeliveryRepository deliveries;
    private final WebhookRepository webhooks;
    private final TargetValidator targetValidator;
    private final ObjectMapper mapper = new ObjectMapper();
    // Lazy-init: HttpClient.newBuilder().build() touches the JDK NIO selector
    // pipe which fails in restricted test sandboxes. Only created when needed.
    private volatile HttpClient http;
    private HttpClient http() {
        HttpClient h = http;
        if (h == null) {
            synchronized (this) {
                if ((h = http) == null) {
                    h = http = HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(5))
                        // Refuse to follow redirects — a 30x to http://169.254.169.254
                        // would bypass our SSRF guard entirely otherwise.
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build();
                }
            }
        }
        return h;
    }
    private final ExecutorService exec = Executors.newThreadPerTaskExecutor(
        Thread.ofVirtual().name("wh-", 0).factory());
    private final Semaphore concurrencyLimit = new Semaphore(MAX_CONCURRENT);

    public WebhookDeliveryWorker(WebhookDeliveryRepository d, WebhookRepository w,
                                 TargetValidator targetValidator) {
        this.deliveries = d; this.webhooks = w;
        this.targetValidator = targetValidator;
    }

    @Scheduled(fixedDelay = 5_000)
    @Transactional   // Holds the SELECT FOR UPDATE SKIP LOCKED lock during dispatch
    public void tick() {
        var pending = deliveries.pending(Instant.now(), PageRequest.of(0, 50));
        for (WebhookDelivery d : pending) {
            exec.submit(() -> {
                try {
                    concurrencyLimit.acquire();   // blocks if 200 already in-flight
                    try { send(d); }
                    finally { concurrencyLimit.release(); }
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                }
            });
        }
    }

    private void send(WebhookDelivery d) {
        Optional<Webhook> maybe = webhooks.findById(d.getWebhookId());
        if (maybe.isEmpty()) { d.setDeadAt(Instant.now()); deliveries.save(d); return; }
        Webhook wh = maybe.get();

        // Defence-in-depth SSRF check at delivery time. WebhookController validates
        // at create-time, but DNS records can change (rebinding TOCTOU), and a
        // database row could in principle be tampered with. Re-validate here.
        if (!isSsrfSafeUrl(wh.getUrl())) {
            d.setStatusCode(0);
            d.setResponseBody("blocked: webhook URL resolves to a private/internal address");
            d.setDeadAt(Instant.now());
            log.warn("Blocked SSRF attempt via webhook {} → {}", wh.getId(), wh.getUrl());
            deliveries.save(d);
            return;
        }

        try {
            String body = switch (wh.getKind()) {
                case "slack"     -> slackBody(d);
                case "discord"   -> discordBody(d);
                case "pagerduty" -> pagerDutyBody(d, wh.getSecret());
                default          -> genericBody(d);
            };
            String signature = hmac(wh.getSecret(), body);

            HttpRequest.Builder reqB = HttpRequest.newBuilder(URI.create(wh.getUrl()))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("User-Agent", "NetScope-Webhook/1.0")
                .POST(HttpRequest.BodyPublishers.ofString(body));
            if ("generic".equals(wh.getKind())) {
                reqB.header("X-NetScope-Event", d.getEventType());
                reqB.header("X-NetScope-Signature", "sha256=" + signature);
                reqB.header("X-NetScope-Delivery", d.getId().toString());
            }
            HttpResponse<String> res = http().send(reqB.build(), HttpResponse.BodyHandlers.ofString());

            d.setStatusCode(res.statusCode());
            d.setResponseBody(res.body());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                d.setSucceededAt(Instant.now());
                wh.setLastSuccessAt(Instant.now());
                webhooks.save(wh);
            } else {
                scheduleRetry(d, wh, "HTTP " + res.statusCode());
            }
        } catch (Exception e) {
            scheduleRetry(d, wh, e.getClass().getSimpleName());
        }
        deliveries.save(d);
    }

    /**
     * Last-line SSRF check. Returns true only if the URL parses, uses http(s),
     * and resolves to a non-private, non-loopback, non-cloud-metadata address.
     */
    boolean isSsrfSafeUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return false;
        try {
            URI uri = new URI(rawUrl);
            String scheme = uri.getScheme();
            String host   = uri.getHost();
            if (scheme == null || host == null) return false;
            if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return false;
            String hostForValidation = host.startsWith("[") && host.endsWith("]")
                ? host.substring(1, host.length() - 1)
                : host;
            targetValidator.resolveAndValidate(hostForValidation);
            return true;
        } catch (URISyntaxException | ApiException e) {
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private void scheduleRetry(WebhookDelivery d, Webhook wh, String reason) {
        int next = d.getAttempt() + 1;
        d.setAttempt(next);
        d.setResponseBody(reason);
        if (next >= MAX_ATTEMPTS) {
            d.setDeadAt(Instant.now());
            log.warn("Webhook {} dead after {} attempts", wh.getUrl(), next);
        } else {
            d.setNextRetryAt(Instant.now().plus(BACKOFF[Math.min(next - 1, BACKOFF.length - 1)]));
        }
        wh.setLastFailureAt(Instant.now());
        webhooks.save(wh);
    }

    private String hmac(String secret, String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    private String genericBody(WebhookDelivery d) throws Exception {
        return mapper.writeValueAsString(Map.of(
            "id", d.getId(), "type", d.getEventType(),
            "createdAt", Instant.now().toString(), "data", d.getPayload()));
    }

    private String slackBody(WebhookDelivery d) throws Exception {
        String title = "🚨 " + d.getEventType();
        Object dataText = d.getPayload().get("text");
        if (dataText == null) dataText = d.getPayload().get("data");
        return mapper.writeValueAsString(Map.of(
            "text", title, "attachments", java.util.List.of(Map.of(
                "color", "#f97316",
                "title", d.getEventType(),
                "text", dataText == null ? d.getPayload().toString() : dataText.toString(),
                "footer", "NetScope", "ts", Instant.now().getEpochSecond()))));
    }

    private String discordBody(WebhookDelivery d) throws Exception {
        return mapper.writeValueAsString(Map.of(
            "username", "NetScope",
            "embeds", java.util.List.of(Map.of(
                "title", d.getEventType(),
                "description", d.getPayload().toString(),
                "color", 16023825,
                "timestamp", Instant.now().toString()))));
    }

    private String pagerDutyBody(WebhookDelivery d, String routingKey) throws Exception {
        return mapper.writeValueAsString(Map.of(
            "routing_key", routingKey, "event_action", "trigger",
            "dedup_key", d.getWebhookId() + ":" + d.getEventType(),
            "payload", Map.of(
                "summary", d.getEventType(),
                "source", "netscope",
                "severity", "error",
                "custom_details", d.getPayload())));
    }
}
