package io.netscope.webhook;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.netscope.common.errors.ApiException;
import io.netscope.common.security.TargetValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;

/**
 * Picks up pending deliveries every 5 s and POSTs them in parallel on a virtual
 * thread pool. Retries with exponential backoff (1 m, 5 m, 30 m, 2 h, 6 h,
 * 24 h). After 6 failed attempts the delivery is marked dead and stops retrying.
 *
 * <h2>Race-safety in a multi-pod deployment (F-RD5-05)</h2>
 *
 * The previous design wrapped {@link #tick()} in a single {@code @Transactional}
 * boundary that also covered the dispatch loop. That looked safe — the pickup
 * query holds {@code SELECT … FOR UPDATE SKIP LOCKED} — but the row locks were
 * released the moment {@code tick()} returned. Returning happened immediately
 * after the rows were SUBMITTED to the virtual-thread pool, not after the HTTP
 * POSTs completed. A second pod's next {@code tick()} 5 s later could observe
 * the same rows as still-pending and POST them again, producing duplicate
 * deliveries to customer endpoints.
 *
 * <p>The fix is a lease handoff:
 * <ol>
 *   <li>{@link #acquireBatch()} runs in its own short {@code REQUIRES_NEW} tx.
 *       It performs
 *       <pre>
 *       SELECT … FOR UPDATE SKIP LOCKED LIMIT N
 *       </pre>
 *       to atomically claim N free rows, stamps each row's {@code worker_id}
 *       and {@code leased_until}, and commits. Two pods running this
 *       concurrently see disjoint sets — SKIP LOCKED skips rows that the
 *       other pod's tx already has under lock. The row lock is released on
 *       commit, but the lease (worker_id + leased_until > now) keeps the
 *       row hidden from the other pod's next {@link #acquireBatch()}.
 *   <li>{@link #send(WebhookDelivery)} runs WITHOUT a tx, so the row lock
 *       is not held across the HTTP POST.
 *   <li>On result, {@link #finaliseSent}, {@link #finaliseRetry}, or
 *       {@link #finaliseDead} runs in another {@code REQUIRES_NEW} tx and
 *       performs a guarded UPDATE checking {@code worker_id = :ourId}. If
 *       the lease expired and another pod re-picked the row, our UPDATE
 *       returns 0 affected rows and we silently drop our result — the other
 *       pod will commit its own outcome.
 * </ol>
 *
 * Crash protection:
 * <ul>
 *   <li>Semaphore(200) caps concurrent in-flight HTTP calls — prevents
 *       unbounded virtual-thread accumulation when target endpoints are
 *       slow/unreachable. At 10 s timeout × 200 threads = max 200 concurrent
 *       blocked calls at any time.</li>
 *   <li>If the pod crashes mid-dispatch, its leases stay in the DB but
 *       expire after {@link #LEASE_TTL}; another pod picks the rows up
 *       cleanly after that delay.</li>
 * </ul>
 */
@Component
public class WebhookDeliveryWorker {

    private static final Logger log = LoggerFactory.getLogger(WebhookDeliveryWorker.class);

    static {
        // F-05 DNS-rebinding defence: we set the Host header explicitly when
        // dispatching webhooks (the URI itself carries the IP literal we
        // validated). JDK's HttpClient blocks Host as a "restricted" header
        // unless we opt in. Must be set before the first HttpClient is built.
        String existing = System.getProperty("jdk.httpclient.allowRestrictedHeaders", "");
        if (!existing.toLowerCase().contains("host")) {
            String merged = existing.isBlank() ? "host" : existing + ",host";
            System.setProperty("jdk.httpclient.allowRestrictedHeaders", merged);
        }
    }

    private static final int MAX_ATTEMPTS = 6;
    /** Hard cap on concurrent outbound webhook POSTs. Prevents runaway thread accumulation. */
    private static final int MAX_CONCURRENT = 200;
    /**
     * F-RD5-05 lease TTL. Must exceed worst-case send() wall-clock so a
     * healthy worker's lease cannot expire mid-POST and let another pod
     * re-pick the same row. send() upper bound:
     *   5 s connect-timeout + 10 s request-timeout + scheduler/GC slack.
     * 90 s gives generous headroom and is short enough that a crashed pod's
     * orphaned rows are reclaimed within ~1.5 minutes.
     */
    private static final Duration LEASE_TTL = Duration.ofSeconds(90);
    private static final int BATCH_SIZE = 50;
    private static final Duration[] BACKOFF = {
        Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(30),
        Duration.ofHours(2), Duration.ofHours(6), Duration.ofHours(24)
    };

    /**
     * F-RD5-05 — Per-pod worker id. Generated once at construction; stamped
     * into webhook_deliveries.worker_id at lease time and checked at
     * finalisation time so that a stale lease (we crashed; another pod
     * picked the row up; we came back and tried to finalise) cannot
     * overwrite the row.
     */
    private final String workerId = "wh-" + UUID.randomUUID();

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
    public void tick() {
        // F-RD5-05: NO @Transactional here. The pickup tx is short-lived and
        // commits BEFORE send() runs. The acquired batch carries a lease
        // (worker_id + leased_until) that excludes other pods from picking up
        // the same rows even though the row lock has been released.
        List<UUID> batch = acquireBatch();
        for (UUID id : batch) {
            exec.submit(() -> {
                try {
                    concurrencyLimit.acquire();   // blocks if 200 already in-flight
                    try { dispatch(id); }
                    finally { concurrencyLimit.release(); }
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                }
            });
        }
    }

    /**
     * F-RD5-05 — Atomically claim up to {@link #BATCH_SIZE} pending rows by
     * stamping each with this worker's id and a lease expiry. Runs in its
     * own short {@code REQUIRES_NEW} tx so the row locks acquired by
     * {@link WebhookDeliveryRepository#pending} are released on commit; the
     * lease columns take over as the exclusion mechanism for the remainder
     * of the dispatch.
     *
     * <p>Uses PostgreSQL's {@code FOR UPDATE SKIP LOCKED} (via the
     * {@code jakarta.persistence.lock.timeout = -2} hint on the pickup
     * query): if pod-A holds rows 1..50 under lock, pod-B's
     * concurrent call returns rows 51..100 immediately instead of waiting.
     * Without SKIP LOCKED, all but one pod would block until commit and
     * then re-execute the same query, defeating the point of horizontal
     * scaling.
     *
     * <p>Returns the row IDs only — the entity is re-fetched per row in
     * {@link #dispatch} to avoid holding stale references across the
     * tx boundary.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    protected List<UUID> acquireBatch() {
        Instant now = Instant.now();
        List<WebhookDelivery> picked =
            deliveries.pending(now, PageRequest.of(0, BATCH_SIZE));
        if (picked.isEmpty()) return List.of();
        Instant leaseExpiry = now.plus(LEASE_TTL);
        List<UUID> ids = new ArrayList<>(picked.size());
        for (WebhookDelivery d : picked) {
            d.setWorkerId(workerId);
            d.setLeasedUntil(leaseExpiry);
            ids.add(d.getId());
        }
        // saveAll() flushes the lease writes; tx commit releases the row
        // locks. From this point on, the rows are invisible to other
        // pods' pending() calls because leased_until > now() for the
        // next LEASE_TTL seconds.
        deliveries.saveAll(picked);
        return ids;
    }

    /**
     * Outside-of-tx dispatch step. Re-loads the row (the lease tx already
     * committed; another pod can no longer steal it), runs send(), and
     * routes the result through one of the guarded finalise paths.
     */
    private void dispatch(UUID id) {
        Optional<WebhookDelivery> maybe = deliveries.findById(id);
        if (maybe.isEmpty()) return;   // deleted between pickup and dispatch
        WebhookDelivery d = maybe.get();
        send(d);
    }

    private void send(WebhookDelivery d) {
        Optional<Webhook> maybe = webhooks.findById(d.getWebhookId());
        if (maybe.isEmpty()) {
            // Parent webhook gone — finalise dead so the lease releases and
            // the row stops appearing in future pending() queries.
            finaliseDead(d, 0, "webhook deleted", null);
            return;
        }
        Webhook wh = maybe.get();

        // Defence-in-depth SSRF check at delivery time. WebhookController validates
        // at create-time, but DNS records can change (rebinding TOCTOU) — closed
        // via IP-literal rewrite + Host header below — and a database row could
        // in principle be tampered with. Re-validate here.
        InetAddress validated = resolveSafeAddress(wh.getUrl());
        if (validated == null) {
            // F-RD2-01: webhook URLs are bearer-equivalent credentials (Slack/Discord
            // embed the auth token in the path), so they must NEVER reach retention-
            // bound log files. Log only the UUID + a scrubbed fingerprint that
            // preserves operator visibility without exposing the token.
            log.warn("Blocked SSRF attempt via webhook {} ({})", wh.getId(),
                scrubbedUrlFingerprint(wh.getUrl()));
            finaliseDead(d, 0,
                "blocked: webhook URL resolves to a private/internal address",
                null);
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

            URI original = URI.create(wh.getUrl());
            // F-05 (DNS-rebinding TOCTOU): the validated InetAddress above and
            // HttpClient's own resolution at send-time would otherwise be two
            // separate DNS lookups; an attacker controlling the authoritative
            // server can return a public IP first (passing validation) then
            // 127.0.0.1 / 169.254.169.254 on the second lookup. Pin the
            // connection to the IP we already validated by swapping the host
            // in the URI for the literal address, and restore the original
            // hostname via the Host header so TLS SNI / vhost routing still works.
            URI pinned = pinHostToAddress(original, validated);
            String hostHeader = hostHeaderValue(original);

            HttpRequest.Builder reqB = HttpRequest.newBuilder(pinned)
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("User-Agent", "NetScope-Webhook/1.0")
                .header("Host", hostHeader)
                .POST(HttpRequest.BodyPublishers.ofString(body));
            if ("generic".equals(wh.getKind())) {
                reqB.header("X-NetScope-Event", d.getEventType());
                reqB.header("X-NetScope-Signature", "sha256=" + signature);
                reqB.header("X-NetScope-Delivery", d.getId().toString());
            }
            HttpResponse<String> res = http().send(reqB.build(), HttpResponse.BodyHandlers.ofString());

            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                finaliseSent(d, wh, res.statusCode(), res.body());
            } else {
                handleRetry(d, wh, res.statusCode(),
                    truncate("HTTP " + res.statusCode() + ": " + res.body()));
            }
        } catch (Exception e) {
            handleRetry(d, wh, null, e.getClass().getSimpleName());
        }
    }

    /* F-RD5-05 — guarded finalisation helpers. Each runs in a fresh
     * REQUIRES_NEW tx and uses an UPDATE … WHERE worker_id = :ours guard,
     * so a stale lease (we crashed and came back after another pod
     * already finalised the row) cannot overwrite the row. */

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    protected void finaliseSent(WebhookDelivery d, Webhook wh, int statusCode, String body) {
        int rows = deliveries.finaliseSucceeded(
            d.getId(), workerId, Instant.now(), statusCode, truncate(body));
        if (rows == 0) {
            // Lost the race: another pod picked the row up after our lease
            // expired and has already committed its own outcome. Discard
            // our result.
            log.info("Stale-lease drop on success for delivery {}", d.getId());
            return;
        }
        wh.setLastSuccessAt(Instant.now());
        webhooks.save(wh);
    }

    private void handleRetry(WebhookDelivery d, Webhook wh, Integer statusCode, String reason) {
        int next = d.getAttempt() + 1;
        if (next >= MAX_ATTEMPTS) {
            // F-RD2-02: webhook URLs are bearer-equivalent credentials (Slack/Discord
            // embed the auth token in the path), so they must NEVER reach retention-
            // bound log files. The UUID alone is enough to cross-reference with the
            // webhooks table; fingerprint included only for at-a-glance debugging.
            log.warn("Webhook {} dead after {} attempts ({})", wh.getId(), next,
                scrubbedUrlFingerprint(wh.getUrl()));
            finaliseDead(d, next, truncate(reason), null);
            recordWebhookFailure(wh);
            return;
        }
        Instant nextRetry = Instant.now()
            .plus(BACKOFF[Math.min(next - 1, BACKOFF.length - 1)]);
        finaliseScheduledRetry(d, next, statusCode, truncate(reason), nextRetry);
        recordWebhookFailure(wh);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    protected void finaliseScheduledRetry(WebhookDelivery d, int attempt,
                                          Integer statusCode, String reason, Instant nextRetryAt) {
        int rows = deliveries.finaliseRetry(
            d.getId(), workerId, attempt, statusCode, reason, nextRetryAt);
        if (rows == 0) {
            log.info("Stale-lease drop on retry for delivery {}", d.getId());
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    protected void finaliseDead(WebhookDelivery d, int attempt,
                                String reason, Integer statusCode) {
        int rows = deliveries.finaliseDead(
            d.getId(), workerId, Instant.now(), attempt,
            statusCode, truncate(reason));
        if (rows == 0) {
            log.info("Stale-lease drop on dead for delivery {}", d.getId());
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    protected void recordWebhookFailure(Webhook wh) {
        wh.setLastFailureAt(Instant.now());
        webhooks.save(wh);
    }

    /**
     * Last-line SSRF check. Returns the validated {@link InetAddress} the
     * hostname resolved to (used to pin the connection — see F-05 mitigation
     * in {@link #send}), or {@code null} if the URL is malformed, uses a
     * non-http(s) scheme, or resolves to a private/loopback/cloud-metadata
     * address.
     */
    InetAddress resolveSafeAddress(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return null;
        try {
            URI uri = new URI(rawUrl);
            String scheme = uri.getScheme();
            String host   = uri.getHost();
            if (scheme == null || host == null) return null;
            if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return null;
            String hostForValidation = host.startsWith("[") && host.endsWith("]")
                ? host.substring(1, host.length() - 1)
                : host;
            return targetValidator.resolveAndValidate(hostForValidation);
        } catch (URISyntaxException | ApiException e) {
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Replaces the hostname in {@code original} with the literal IP of
     * {@code addr}, preserving scheme, port, path, query, and fragment.
     * IPv6 literals are bracketed. This is the heart of the F-05 defence:
     * by handing HttpClient an IP-literal URI, we guarantee the TCP
     * connection goes to the address we already validated and not a freshly
     * re-resolved one.
     */
    private static URI pinHostToAddress(URI original, InetAddress addr) throws URISyntaxException {
        String literal = addr.getHostAddress();
        String hostPart = addr instanceof Inet6Address ? "[" + stripZoneId(literal) + "]" : literal;
        // URI(String) constructor preserves an IPv6 zone-id mess; build via the
        // multi-arg constructor for predictable encoding.
        return new URI(
            original.getScheme(),
            original.getUserInfo(),
            hostPart,
            original.getPort(),
            original.getPath(),
            original.getQuery(),
            original.getFragment()
        );
    }

    /** IPv6 literals from {@link InetAddress#getHostAddress()} may carry a "%eth0" zone-id; strip it for URI use. */
    private static String stripZoneId(String ipv6) {
        int pct = ipv6.indexOf('%');
        return pct < 0 ? ipv6 : ipv6.substring(0, pct);
    }

    /**
     * Builds the {@code Host} request header from the original URL so the
     * remote server still sees the hostname (and TLS SNI / vhost routing
     * keeps working) after we pinned the URI to an IP literal. Includes the
     * explicit port when one was specified.
     */
    private static String hostHeaderValue(URI original) {
        String host = original.getHost();
        int port = original.getPort();
        return port < 0 ? host : host + ":" + port;
    }

    /**
     * F-RD2-01 / F-RD2-02 — Returns a log-safe fingerprint of a webhook URL.
     *
     * <p>Slack and Discord webhook URLs embed the auth token directly in the
     * path (e.g. {@code https://hooks.slack.com/services/T08XXXX/B0YYYY/zzzz}),
     * so the full URL is a bearer-equivalent credential and must never be
     * persisted to retention-bound log files. This helper keeps the scheme,
     * host, and at most the first 8 path characters — enough for operators to
     * tell Slack from Discord (and rough-correlate within a tenant) without
     * exposing the token.
     *
     * <p>Returns {@code "<malformed>"} if the URL can't be parsed, and
     * {@code "<null>"} if it's null/blank.
     */
    static String scrubbedUrlFingerprint(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return "<null>";
        try {
            URI uri = new URI(rawUrl);
            String scheme = uri.getScheme();
            String host   = uri.getHost();
            if (scheme == null || host == null) return "<malformed>";
            String path = uri.getRawPath();
            if (path == null || path.isEmpty() || "/".equals(path)) {
                return scheme + "://" + host + "/";
            }
            // Trim the path to at most 8 chars after the leading '/' so we
            // never bleed into a Slack/Discord token segment.
            String trimmed = path.length() > 9 ? path.substring(0, 9) + "..." : path;
            return scheme + "://" + host + trimmed;
        } catch (URISyntaxException e) {
            return "<malformed>";
        }
    }

    /** WebhookDelivery.setResponseBody enforces ≤500 chars but the JPQL UPDATE
     *  path skips that setter, so we truncate at the call site instead. */
    private static String truncate(String s) {
        if (s == null) return null;
        return s.length() < 500 ? s : s.substring(0, 500);
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
