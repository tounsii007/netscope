package io.netscope.billing;

import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.Subscription;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.checkout.SessionCreateParams;
import io.netscope.common.errors.ApiException;
import io.netscope.user.SessionContext;
import io.netscope.user.UserRepository;
import io.netscope.workspace.Workspace;
import io.netscope.workspace.WorkspaceMember;
import io.netscope.workspace.WorkspaceRepository;
import io.netscope.workspace.WorkspaceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
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
@RestController
@RequestMapping("/api/v1/billing")
public class BillingController {

    private static final Logger log = LoggerFactory.getLogger(BillingController.class);

    public record CheckoutRequest(@NotBlank UUID workspaceId, @NotBlank String priceId) {}
    public record PortalRequest(@NotBlank UUID workspaceId) {}

    private final WorkspaceRepository workspaces;
    private final WorkspaceService wsService;
    private final UserRepository users;

    @Value("${netscope.stripe.webhook-secret:}")
    private String webhookSecret;

    @Value("${netscope.stripe.return-url:https://netscope.io/settings/billing}")
    private String returnUrl;

    public BillingController(WorkspaceRepository workspaces, WorkspaceService wsService, UserRepository users) {
        this.workspaces = workspaces; this.wsService = wsService; this.users = users;
    }

    @PostMapping("/checkout")
    public Map<String, Object> checkout(@Valid @RequestBody CheckoutRequest req) {
        Workspace w = wsService.requireRole(req.workspaceId(), WorkspaceMember.Role.OWNER);
        var user = users.findById(SessionContext.requireUserId()).orElseThrow();
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

            Session s = Session.create(b.build());
            // Map.of(...) rejects null values with NPE. Stripe's Session
            // .getUrl() is documented nullable (a misconfigured price ID
            // or hosted-checkout setting can produce a session without a
            // redirect URL). Surface a clean 400 instead of a useless
            // 500 with correlationId.
            if (s.getUrl() == null) {
                throw ApiException.badRequest("Stripe did not return a checkout URL — verify the price ID is published");
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

        switch (event.getType()) {
            case "checkout.session.completed" -> onCheckoutComplete(event);
            case "customer.subscription.created",
                 "customer.subscription.updated",
                 "customer.subscription.deleted" -> onSubscriptionChange(event);
            default -> log.debug("Ignoring Stripe event {}", event.getType());
        }
        return ResponseEntity.ok("ok");
    }

    private void onCheckoutComplete(Event event) {
        StripeObject obj = event.getDataObjectDeserializer().getObject().orElse(null);
        if (!(obj instanceof Session s)) return;
        String wsId = s.getClientReferenceId();
        if (wsId == null) return;
        workspaces.findById(UUID.fromString(wsId)).ifPresent(w -> {
            w.setStripeCustomerId(s.getCustomer());
            w.setStripeSubscriptionId(s.getSubscription());
            workspaces.save(w);
        });
    }

    private void onSubscriptionChange(Event event) {
        StripeObject obj = event.getDataObjectDeserializer().getObject().orElse(null);
        if (!(obj instanceof Subscription sub)) return;
        workspaces.findByStripeCustomerId(sub.getCustomer()).ifPresent(w -> {
            String plan = mapPlan(sub);
            w.setPlan(plan);
            w.setStripeSubscriptionId(sub.getId());
            workspaces.save(w);
            log.info("Workspace {} plan updated to {}", w.getSlug(), plan);
        });
    }

    private String mapPlan(Subscription sub) {
        if (!"active".equals(sub.getStatus()) && !"trialing".equals(sub.getStatus())) return "free";
        var items = sub.getItems();
        if (items == null || items.getData().isEmpty()) return "free";
        String priceId = items.getData().get(0).getPrice().getId();
        // Map your Stripe price IDs to plans. Fall back to free if unknown.
        return switch (priceId) {
            case "price_pro"      -> "pro";
            case "price_business" -> "business";
            default -> priceMatches(priceId, List.of("pro")) ? "pro"
                : priceMatches(priceId, List.of("business", "biz")) ? "business" : "free";
        };
    }

    private boolean priceMatches(String id, List<String> keywords) {
        String lower = id.toLowerCase();
        return keywords.stream().anyMatch(lower::contains);
    }
}
