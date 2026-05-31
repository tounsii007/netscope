package io.netscope.billing;

import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.checkout.Session;
import com.stripe.net.RequestOptions;
import com.stripe.net.Webhook;
import com.stripe.param.checkout.SessionCreateParams;
import io.netscope.common.errors.ApiException;
import io.netscope.user.SessionContext;
import io.netscope.user.UserRepository;
import io.netscope.workspace.Workspace;
import io.netscope.workspace.WorkspaceMember;
import io.netscope.workspace.WorkspaceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

/**
 * Stripe integration:
 *  - POST /billing/checkout → returns a hosted Checkout URL for a price_id
 *  - POST /billing/portal   → returns a customer portal URL
 *  - POST /billing/webhook  → receives Stripe events, updates workspace plan
 *
 * Usage metering is done by {@link UsageMeteringFilter} which increments a
 * per-hour counter in Postgres. A nightly job pushes the sum to Stripe using
 * the usage-records API if a subscription is metered.
 */
@Tag(name = "Account", description = "Stripe checkout, customer portal, and webhook endpoints for workspace billing")
@RestController
@RequestMapping("/api/v1/billing")
public class BillingController {

    private static final Logger log = LoggerFactory.getLogger(BillingController.class);

    // F-RD4-05: idempotencyKey is optional. The frontend SHOULD mint a
    // UUID per checkout-button click and resend it on retry so Stripe
    // dedupes server-side; if the client omits it we derive one
    // deterministically below (userId + priceId + current minute).
    public record CheckoutRequest(@NotBlank UUID workspaceId, @NotBlank String priceId,
                                  String idempotencyKey) {}
    public record PortalRequest(@NotBlank UUID workspaceId) {}

    /** F-RD4-05: in-flight checkout-session cache TTL. Long enough to
     *  cover a refresh/double-click within the same checkout attempt,
     *  short enough that a stale URL doesn't outlive Stripe's own session
     *  expiry (Stripe Checkout sessions expire after 24h, but the URL is
     *  most useful within minutes of mint). */
    private static final Duration INFLIGHT_TTL = Duration.ofMinutes(10);

    /** F-RD4-05: Redis namespace for the in-flight session URL cache. */
    private static final String INFLIGHT_NS = "billing:checkout:inflight:";

    private final WorkspaceService wsService;
    private final UserRepository users;
    // F-RD4-06: webhook event dispatch moved out of this controller so
    // it can be wrapped in @Transactional(REPEATABLE_READ) with a
    // pessimistic row lock on subscription_states. Keeping the dispatch
    // logic inline on the controller method would defeat Spring's
    // proxy-based transaction interception (self-invocation bypasses it).
    private final StripeWebhookService webhookService;
    // F-RD4-05: Redis-backed cache of in-flight checkout-session URLs
    // keyed by (userId, price_id). Coalesces refresh/double-click into a
    // single Stripe Customer + Subscription. Survives JVM restarts (which
    // an in-memory ConcurrentHashMap would not), and races safely across
    // replicas behind a load balancer.
    private final StringRedisTemplate redis;

    @Value("${netscope.stripe.webhook-secret:}")
    private String webhookSecret;

    @Value("${netscope.stripe.return-url:https://netscope.io/settings/billing}")
    private String returnUrl;

    public BillingController(WorkspaceService wsService, UserRepository users,
                             StripeWebhookService webhookService,
                             StringRedisTemplate redis) {
        this.wsService = wsService;
        this.users = users;
        this.webhookService = webhookService;
        this.redis = redis;
    }

    @Operation(summary = "Create Stripe Checkout session for a price")
    @PostMapping("/checkout")
    public Map<String, Object> checkout(@Valid @RequestBody CheckoutRequest req) {
        Workspace w = wsService.requireRole(req.workspaceId(), WorkspaceMember.Role.OWNER);
        UUID userId = SessionContext.requireUserId();
        var user = users.findById(userId).orElseThrow();
        // F-RD4-05: a refresh or double-click on the checkout button used
        // to spawn a fresh Stripe Customer + Subscription on every
        // request, since each Session.create() with no idempotency key is
        // a new server-side mutation. We defend in two layers:
        //   1. a Redis in-flight cache keyed by (userId, price_id) that
        //      short-circuits the second click within INFLIGHT_TTL by
        //      returning the URL the first click already minted; and
        //   2. a Stripe Idempotency-Key header so even if the in-flight
        //      cache misses (e.g. two replicas race the SETNX before the
        //      first writes the URL), Stripe itself dedupes and returns
        //      the same session.
        String normalisedPriceId = normalisePriceId(req.priceId());
        String inflightKey = INFLIGHT_NS + userId + ":" + normalisedPriceId;
        String cachedUrl = redis.opsForValue().get(inflightKey);
        if (cachedUrl != null && !cachedUrl.isBlank()) {
            return Map.of("url", cachedUrl);
        }
        String idempotencyKey = resolveIdempotencyKey(
            req.idempotencyKey(), userId, normalisedPriceId);
        try {
            SessionCreateParams.Builder b = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
                .addLineItem(SessionCreateParams.LineItem.builder()
                    .setQuantity(1L).setPrice(req.priceId()).build())
                .setSuccessUrl(returnUrl + "?status=success")
                .setCancelUrl(returnUrl + "?status=cancelled")
                .setClientReferenceId(w.getId().toString())
                .putMetadata("workspace_id", w.getId().toString());

            if (w.getStripeCustomerId() != null) b.setCustomer(w.getStripeCustomerId());
            else b.setCustomerEmail(user.getEmail());

            // F-RD4-05: Stripe's Java SDK passes Idempotency-Key through
            // RequestOptions (not the SessionCreateParams builder — the
            // header lives at the request layer, not the body). A repeat
            // request with the same key within Stripe's 24h replay window
            // returns the *same* Session object instead of creating a
            // duplicate Customer / Subscription.
            RequestOptions opts = RequestOptions.builder()
                .setIdempotencyKey(idempotencyKey)
                .build();
            Session s = Session.create(b.build(), opts);
            // Map.of(...) rejects null values with NPE. Stripe's Session
            // .getUrl() is documented nullable (a misconfigured price ID
            // or hosted-checkout setting can produce a session without a
            // redirect URL). Surface a clean 400 instead of a useless
            // 500 with correlationId.
            if (s.getUrl() == null) {
                throw ApiException.badRequest("Stripe did not return a checkout URL — verify the price ID is published");
            }
            // F-RD4-05: cache the URL so subsequent refresh/double-click
            // requests within INFLIGHT_TTL get an immediate cache hit and
            // never reach Stripe at all. Best-effort — a Redis outage
            // shouldn't fail the user's checkout (the Idempotency-Key
            // header is still in place as a fallback dedupe).
            try {
                redis.opsForValue().set(inflightKey, s.getUrl(), INFLIGHT_TTL);
            } catch (Exception cacheEx) {
                log.warn("F-RD4-05 in-flight cache write failed (degraded — Idempotency-Key still active): {}",
                    cacheEx.getMessage());
            }
            return Map.of("url", s.getUrl());
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            // Stripe SDK exception messages include the priceId,
            // customer email, internal Stripe IDs, request-id correlation
            // tokens, and account country — reflecting them through the
            // 400 leaks operator state to anyone who can trigger the
            // failure. Log the full cause server-side with a correlation
            // ID and return a stable, opaque message to the client.
            String correlationId = UUID.randomUUID().toString();
            log.error("Stripe checkout failed (correlation={})", correlationId, e);
            throw ApiException.badRequest("Stripe checkout failed (ref: " + correlationId + ")");
        }
    }

    /**
     * F-RD4-05: pick the Idempotency-Key to send to Stripe.
     *
     * Preference order:
     *   1. Client-supplied UUID (frontend mints one per button click and
     *      resends it on retry). Trusted as opaque — we don't inspect
     *      its shape beyond a length cap, so a UI that swaps to (say) a
     *      ULID instead doesn't break here.
     *   2. Server-derived key over (userId, normalised priceId, current
     *      minute). A refresh / double-click within the same minute will
     *      land on the same key and dedupe at Stripe. Past one minute
     *      the key rotates so a deliberate re-checkout still works.
     *
     * Stripe accepts up to 255 chars for the Idempotency-Key header; a
     * SHA-256 hex (64 chars) leaves plenty of headroom and avoids leaking
     * the raw userId UUID into Stripe's audit log.
     */
    static String resolveIdempotencyKey(String clientSupplied, UUID userId, String normalisedPriceId) {
        if (clientSupplied != null && !clientSupplied.isBlank()) {
            String trimmed = clientSupplied.trim();
            // Stripe's documented cap is 255 chars; clamp defensively so
            // a stray pasted blob doesn't get rejected by Stripe with a
            // 400 the operator then has to debug.
            return trimmed.length() > 255 ? trimmed.substring(0, 255) : trimmed;
        }
        long minuteEpoch = System.currentTimeMillis() / 60_000L;
        String material = userId.toString() + "|" + normalisedPriceId + "|" + minuteEpoch;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(material.getBytes(StandardCharsets.UTF_8));
            return "srv-" + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandatory on every JRE — if it's missing we
            // can't safely derive a key, so fall back to a fresh UUID
            // (loses dedupe but doesn't block checkout).
            return "srv-fallback-" + UUID.randomUUID();
        }
    }

    /**
     * F-RD4-05: normalise the price id so casing / surrounding whitespace
     * variations all map to the same in-flight cache slot and derived
     * idempotency key. Stripe price IDs are case-sensitive
     * (price_XXXXX), but accidental "Price_XXXXX" or "  price_xxx  " from
     * a copy-paste shouldn't bypass dedupe. We lower-case for the cache
     * key only — the raw user-supplied value is what's still sent to
     * Stripe on the wire (Stripe will reject the wrong casing with a
     * clean 400, surfacing the typo to the operator).
     */
    static String normalisePriceId(String priceId) {
        if (priceId == null) return "";
        String trimmed = priceId.trim().toLowerCase(java.util.Locale.ROOT);
        // Hash if oversized so a pathological input can't bloat the
        // Redis key. Price IDs are normally ~30 chars; anything past 128
        // is almost certainly malformed.
        if (trimmed.length() > 128) {
            try {
                byte[] d = MessageDigest.getInstance("SHA-256")
                    .digest(trimmed.getBytes(StandardCharsets.UTF_8));
                return Base64.getUrlEncoder().withoutPadding().encodeToString(d);
            } catch (NoSuchAlgorithmException e) {
                return trimmed.substring(0, 128);
            }
        }
        return trimmed;
    }

    @Operation(summary = "Create Stripe customer portal session")
    @PostMapping("/portal")
    public Map<String, Object> portal(@Valid @RequestBody PortalRequest req) {
        Workspace w = wsService.requireRole(req.workspaceId(), WorkspaceMember.Role.OWNER);
        if (w.getStripeCustomerId() == null) throw ApiException.badRequest("no billing account yet");
        try {
            var s = com.stripe.model.billingportal.Session.create(
                com.stripe.param.billingportal.SessionCreateParams.builder()
                    .setCustomer(w.getStripeCustomerId())
                    .setReturnUrl(returnUrl)
                    .build());
            if (s.getUrl() == null) {
                throw ApiException.badRequest("Stripe did not return a portal URL");
            }
            return Map.of("url", s.getUrl());
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            String correlationId = UUID.randomUUID().toString();
            log.error("Stripe portal failed (correlation={})", correlationId, e);
            throw ApiException.badRequest("Stripe portal failed (ref: " + correlationId + ")");
        }
    }

    @Operation(summary = "Receive Stripe webhook events")
    @PostMapping("/webhook")
    public ResponseEntity<String> webhook(
            @RequestBody String payload,
            @RequestHeader("Stripe-Signature") String signature) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            log.error("Stripe webhook received but netscope.stripe.webhook-secret not configured");
            return ResponseEntity.status(500).body("not configured");
        }
        Event event;
        try { event = Webhook.constructEvent(payload, signature, webhookSecret); }
        catch (SignatureVerificationException e) {
            log.warn("Invalid Stripe signature");
            return ResponseEntity.status(400).body("bad signature");
        }

        // F-RD4-06: dispatch through the transactional service. The
        // service is responsible for pessimistic row locking on
        // subscription_states, the (event.id, applied_at) idempotency
        // log, and the event.created out-of-order guard. The controller
        // stays HTTP-only: signature check, dispatch, 200.
        //
        // We always return 200 if the service ran — including the
        // "already applied" path — because Stripe interprets a non-2xx
        // as a delivery failure and retries on its own schedule, which
        // would just churn the idempotency log.
        webhookService.apply(event);
        return ResponseEntity.ok("ok");
    }
}
