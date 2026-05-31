# Security Review — 2026 Q2, Round 4

**Reviewer:** workflow-driven adversarial scan, round 4
**Date:** 2026-05-30
**Scope:** every @RestController + supporting services under api/src/main/java/io/netscope/

## Round-4 vs prior rounds

R1: input-validation, SSRF, error-disclosure, auth-rate-limit → 6 confirmed (all fixed).
R2: XXE / Jackson, open-redirect, timing, log-PII, header-injection, DoS → 8 confirmed (all fixed).
R3: JWT-completeness, OAuth-state/PKCE, CSRF-session, mass-assign, TLS-outbound, Stripe-replay → 6 confirmed (all auth, fix in flight).
R4 (this report): IDOR, race conditions, email injection, path traversal, cache poisoning, pre-auth disclosure.

## Summary

- Dimensions: 6
- Raw findings: 24
- Dedup: 24
- Adversarially verified: 18
- Confirmed real: 9
- False positives: 9

## Confirmed findings

### F-RD4-01 — Workspace-invite endpoint enumerates registered users before role check

**Severity:** medium
**Category:** User enumeration before authorisation (IDOR-adjacent)
**Location:** api/src/main/java/io/netscope/workspace/WorkspaceController.java:50

**Claim:** POST /api/v1/workspaces/{id}/members performs users.findByEmail(req.email()) BEFORE any workspace-membership / role check. The role check happens deep inside service.invite() via requireRole(workspaceId,...). That means any authenticated user with a valid JWT can probe whether arbitrary email addresses are registered users by POSTing to /api/v1/workspaces/<random-uuid>/members with a body containing a guess email. If the email is unknown, the server returns 404 'user with that email has not signed up yet'. If the email IS registered, the request progresses to requireRole() and returns 403 'not a member' — a clear differential. Order of operations should be requireRole() first, lookup second, and the user-not-found path should return the same generic error as 'not a member' to defeat enumeration.

**Bypass path:**
Confirmed at C:/projects/netscope/api/src/main/java/io/netscope/workspace/WorkspaceController.java:50. The POST /api/v1/workspaces/{id}/members handler calls `users.findByEmail(req.email())` BEFORE any workspace-membership or role gate. No upstream guard blocks the lookup: SecurityConfig.java only enforces authentication via SessionFilter (no @PreAuthorize/@Secured on this method), the controller has no @PreAuthorize, and there is no method-security advice on the repository. The role gate lives only at WorkspaceService.java:70 inside `service.invite()`, which the controller never reaches when the email is unknown — line 51 throws first with `ApiException.notFound("user with that email has not signed up yet")` (HTTP 404). When the email IS registered, control flows into the verified-email check (line 57, 400 "invitee has not verified their email yet") or onward into service.invite() → requireRole() → `ApiException.forbidden("not a member")` (HTTP 403). The three error paths produce distinct status codes AND distinct messages, giving an authenticated attacker a clean 4-state oracle (unknown / known-unverified / known-verified-non-admin-workspace / known-verified-admin-workspace) per request. The workspace UUID can be any random/non-existent value — the lookup runs regardless. To exploit: any logged-in user POSTs `{"email":"victim@x"}` to `/api/v1/workspaces/<random-uuid>/members`; 404 → not registered, 400 → registered but unverified, 403 "not a member" → registered+verified. Iterating the email field harvests the user table and even leaks email-verification status.

**Recommended fix:**
Move requireRole() to be the first thing the controller does (or push the entire flow into the service behind the role gate) AND collapse all post-auth failure messages to a single generic string so registered/unregistered/unverified are indistinguishable to non-admins of the workspace.

---

### F-RD4-02 — CT-monitor endpoints leak subscription existence cross-tenant

**Severity:** low
**Category:** Existence-disclosure oracle (non-atomic ownership check)
**Location:** api/src/main/java/io/netscope/ctmonitor/CtMonitorController.java:58

**Claim:** GET /api/v1/ct/{id}/observations and DELETE /api/v1/ct/{id} both do subs.findById(id) FIRST (returns 404 'subscription' if the row is missing), then workspaces.requireAccess(s.getWorkspaceId()) (returns 403 'not a member of this workspace' if the caller is not in the owning workspace). The two-step pattern means a cross-tenant attacker who probes random UUIDs can distinguish 'subscription does not exist' (404) from 'subscription exists but belongs to another workspace' (403). Compare with MonitorController.history/delete which uses the atomic findByIdAndApiKeyId — the codebase has the pattern, it's just not used here. Repository CtSubscriptionRepository lacks a findByIdAndWorkspaceId helper.

**Bypass path:**
CtMonitorController.java:58-62 (observations) and :65-70 (unsubscribe) both perform the ownership check in two distinguishable steps:
  1. `subs.findById(id).orElseThrow(() -> ApiException.notFound("subscription"))` → 404 with message "subscription" when the row is absent.
  2. `workspaces.requireAccess(s.getWorkspaceId())` or `requireRole(...)` → WorkspaceService.java:55 and :62 throw `ApiException.forbidden("not a member of this workspace")` / `"not a member"` when the caller is not in the owning workspace.

This produces a 404 vs 403 differential that a cross-tenant attacker can use to confirm whether a given UUID maps to an existing CT subscription. The two status codes and their distinct messages are observable.

CtSubscriptionRepository.java (lines 9-12) only exposes `findByWorkspaceId(UUID)` and `findByWorkspaceIdAndDomain(UUID, String)` — there is no `findByIdAndWorkspaceId` helper, so the controller cannot do an atomic lookup as the claim states.

The contrast cited is also accurate: MonitorController.java:101 (history) and :110 (delete) use `monitors.findByIdAndApiKeyId(id, ApiKeyContext.get().getId()).orElseThrow(() -> ApiException.notFound("monitor not found"))`, with an inline comment explicitly noting "Atomic owner check — no timing gap to distinguish 403 from 404." This is the same idiom the CT controller is missing.

Severity 'low' is appropriate: subscription IDs are UUIDs (≈122 bits of entropy), so this is a confirmation oracle, not a discovery oracle — an attacker still needs an outside source for candidate UUIDs (timing leak, log exposure, billing report, etc.). But the bypass path is genuine, the in-repo fix pattern already exists, and the only change needed is to add `Optional<CtSubscription> findByIdAndWorkspaceId(UUID id, UUID workspaceId)` to the repository and restructure the controller methods to call it with the caller's accessible workspace(s), collapsing both "not yours" and "doesn't exist" into a single 404.

**Recommended fix:**
Add `Optional<CtSubscription> findByIdAndWorkspaceId(UUID id, UUID workspaceId)` to CtSubscriptionRepository and rewrite the observations/unsubscribe handlers to call it with the caller's accessible workspace(s). Collapse both "not yours" and "doesn't exist" branches into a single 404 with a uniform body.

---

### F-RD4-03 — Status-page incident endpoint leaks page existence cross-tenant

**Severity:** low
**Category:** Existence-disclosure oracle (non-atomic ownership check)
**Location:** api/src/main/java/io/netscope/status/StatusPageController.java:72

**Claim:** POST /api/v1/status-pages/{id}/incidents looks up StatusPage with pages.findById(id) (404 'page not found' if missing) and then requires OWNER/ADMIN via workspaces.requireRole(p.getWorkspaceId(), ...) (403 'not a member' if foreign). Same 403/404 oracle as the CT endpoints: a cross-tenant attacker can distinguish 'this status-page UUID does not exist' from 'this status-page UUID exists but you cannot write to it'. There is no atomic findByIdAndWorkspaceId. Note that publicView already enforces the public/private flag — but createIncident leaks existence even for status pages that have publicAccess=false.

**Bypass path:**
StatusPageController.createIncident (api/src/main/java/io/netscope/status/StatusPageController.java:72-82) executes a non-atomic two-step check that leaks status-page existence cross-tenant.

1. Line 73: `pages.findById(id).orElseThrow(() -> ApiException.notFound("page not found"))` — StatusPageRepository only exposes `findById(UUID)` and `findByWorkspaceId(UUID)`; there is no `findByIdAndWorkspaceId`. A nonexistent UUID returns 404 with body "page not found".
2. Line 74: `workspaces.requireRole(p.getWorkspaceId(), OWNER, ADMIN)`. In WorkspaceService.requireRole (line 59-66), the membership lookup throws `ApiException.forbidden("not a member")` (403) when the current user is not in the workspace. So an existing-but-foreign status-page UUID returns 403.

There is no @PreAuthorize, no Hibernate filter, no security-context interceptor on the controller — the only authorization gate runs after the existence check. The publicAccess flag is only consulted in `publicView` (line 88), not here, so even pages with `publicAccess=false` are subject to the 403/404 oracle.

An authenticated attacker iterating UUIDs (with any syntactically valid IncidentRequest body, since @Valid runs at argument binding before the controller body) can distinguish "this status-page ID exists in some other workspace" from "this status-page ID does not exist", including for private (publicAccess=false) pages otherwise invisible. This is the same oracle pattern as the CT-endpoint findings cited by the reporter. Severity low is appropriate: status-page IDs are random UUIDs so the practical attack surface is limited, but the disclosure is real and the fix is the standard `findByIdAndWorkspaceId(id, p.getWorkspaceId())` pattern that returns a uniform 404 on both branches.

**Recommended fix:**
Add `Optional<StatusPage> findByIdAndWorkspaceId(UUID id, UUID workspaceId)` to StatusPageRepository, restructure createIncident to call it with the caller's accessible workspace ids, and return a uniform 404 on both the not-found and foreign-workspace branches.

---

### F-RD4-04 — Public status-page lookup discloses existence of private pages to anonymous probes

**Severity:** low
**Category:** Existence-disclosure oracle for private status pages
**Location:** api/src/main/java/io/netscope/status/StatusPageController.java:86

**Claim:** GET /api/v1/status-pages/public/{slug} is UNAUTHENTICATED. It does pages.findBySlug(slug) (404 if missing), then 'if (!p.isPublicAccess()) throw forbidden("status page is private")'. An anonymous attacker can iterate slugs and use the 403-vs-404 differential to confirm the existence of PRIVATE status pages (slug names are short — ^[a-z0-9-]{3,64}$ — so brute-forcing common product names is realistic). For a private page, both responses should be the same 404 to avoid leaking the slug's existence.

**Bypass path:**
TRUST BOUNDARY: SecurityConfig.java:62 explicitly maps `/api/v1/status-pages/public/**` to `permitAll()` and CSRF is also disabled for it (line 50). ApiKeyFilter.PRIVATE_PREFIXES only covers `/api/v1/monitor`, `/api/v1/bulk`, `/api/v1/private` — the public status-page path is anonymous all the way through to the controller.

DIFFERENTIAL: In StatusPageController.publicView() (lines 86-88):
- Missing slug → `ApiException.notFound("status page not found")`
- Existing slug with `publicAccess=false` → `ApiException.forbidden("status page is private")`
ApiException.java maps `notFound` → HttpStatus.NOT_FOUND (404) and `forbidden` → HttpStatus.FORBIDDEN (403). The status codes are distinct and observable by an anonymous client. Even ignoring the body text, the 403-vs-404 split is a reliable oracle.

ENUMERABILITY: Slug pattern (CreateRequest line 26) is `^[a-z0-9-]{3,64}$`. Brand names, internal product names, and common words are trivially within reach of an offline dictionary attack at any reasonable request rate.

IMPACT: An anonymous attacker can iterate candidate slugs (acme, internal, staging, $company-name, etc.) and learn which ones are registered as PRIVATE status pages. This is information that the private flag is explicitly trying to hide. Useful for targeted phishing, competitive recon, and brand-enumeration against the platform's tenants. No sensitive content leaks beyond existence — hence "low" severity is appropriate.

**Recommended fix:**
Collapse the private branch into the same 404 response — `if (!p.isPublicAccess()) throw ApiException.notFound("status page not found");` so the response is indistinguishable from a non-existent slug.

---

### F-RD4-05 — Stripe checkout has no idempotency, allowing orphaned customers and double-billing

**Severity:** medium
**Category:** double-submit / no idempotency
**Location:** api/src/main/java/io/netscope/billing/BillingController.java:67

**Claim:** BillingController.checkout has no idempotency or in-flight de-dup. A double-click (or retry on slow network) calls Session.create(...) twice — Stripe returns two distinct Checkout sessions tied to the same workspace via setClientReferenceId(w.getId()). If the user happens to pay through both (legitimate user impatient, or two browser tabs), onCheckoutComplete (line 158) writes setStripeCustomerId/setStripeSubscriptionId twice with no transaction, no optimistic lock, and no UNIQUE on stripeSubscriptionId — last-writer-wins overwrites a real, billed Stripe customer/subscription ID. Workspace.stripeCustomerId IS unique (DB constraint), but a different second customer (one tab logged out → customerEmail path on line 81 creates a NEW Stripe customer) will collide on save and the user will pay for a subscription whose ID was never persisted. Mitigation patterns missing: per-(workspaceId, priceId) Idempotency-Key header to Stripe (Session.create supports it), or a short Redis lock around checkout() keyed by workspace+price.

**Bypass path:**
Confirmed REAL. BillingController.checkout (api/src/main/java/io/netscope/billing/BillingController.java:67) calls Session.create(...) with no Idempotency-Key header, no per-workspace lock, and no check for an in-flight checkout. The wsService.requireRole guard at line 68 only verifies OWNER role — it does not serialize concurrent checkout attempts. When w.getStripeCustomerId() is null (line 80-81), the code takes the setCustomerEmail branch, so Stripe creates a *new* customer for each concurrent session. The DB confirms stripe_customer_id is UNIQUE (V3__platform.sql line 23; Workspace.java line 16 with unique=true) but stripe_subscription_id is NOT unique. Critically, the UNIQUE constraint does NOT protect the overwrite path: both webhooks target the *same* workspace row by clientReferenceId UUID, so onCheckoutComplete (line 158-167) does workspaces.findById(wsId).ifPresent(w -> { w.setStripeCustomerId(s.getCustomer()); workspaces.save(w); }) — webhook B simply overwrites cus_A with cus_B on the same row. There is no @Transactional, no @Version optimistic lock on Workspace, no idempotency check on event.id, and no preflight to see if stripeCustomerId/stripeSubscriptionId is already set before overwriting. Reproduction exactly matches the claim: two tabs → two Stripe customers → both pay → second webhook orphans the first customer/subscription in Stripe with no DB pointer (and the customer is still billed). Severity medium is appropriate — requires the user to actually pay twice, but the orphaned-billing state and operational cleanup cost are real.

**Recommended fix:**
Pass SessionCreateParams.Builder.putExtraParam or set an Idempotency-Key on the RequestOptions keyed by (workspaceId, priceId), add a short-lived Redis/DB lock, and/or refuse onCheckoutComplete writes when stripeCustomerId is already populated with a different value.

---

### F-RD4-06 — Stripe webhook handlers race on plan state, allowing lost cancellations and entitlement drift

**Severity:** high
**Category:** webhook idempotency / lost-update on plan
**Location:** api/src/main/java/io/netscope/billing/BillingController.java:158

**Claim:** Stripe webhook handlers (onCheckoutComplete, onSubscriptionChange) have NO idempotency on event.getId(), NO @Transactional wrapper, NO @Version on Workspace, and NO event-ordering check. Stripe documents that events may be delivered MORE THAN ONCE and OUT OF ORDER. Concurrent delivery of customer.subscription.updated and customer.subscription.deleted will race the read-modify-write at lines 173-177: both threads read the same Workspace via findByStripeCustomerId, both call mapPlan, both call workspaces.save(w). If the late-arriving event is the older one (deleted event delivered AFTER created event), w.setPlan('free') overwrites the paid plan and the customer loses entitlement. The dedup window for webhook signature verification (Stripe default 300 s tolerance) does NOT prevent re-delivery — it prevents replay-without-signature. There is no audit log of processed event IDs.

**Bypass path:**
Confirmed REAL in C:/projects/netscope/api/src/main/java/io/netscope/billing/BillingController.java lines 134–180 and C:/projects/netscope/api/src/main/java/io/netscope/workspace/Workspace.java.

Evidence:
1. Signature is verified (line 142), but after that `event.getId()` is NEVER consulted as a dedup key. A grep for `event.getId`, `stripeEventId`, `processed_event`, `WebhookEvent` across `api/src` returns zero matches — there is no event-log / idempotency table.
2. `onSubscriptionChange` (line 170) is the textbook read-modify-write Stripe documents must be defended against:
   `workspaces.findByStripeCustomerId(sub.getCustomer()).ifPresent(w -> { String plan = mapPlan(sub); w.setPlan(plan); w.setStripeSubscriptionId(sub.getId()); workspaces.save(w); });`
   No `@Transactional` on the handler, no `@Version` on Workspace (the entity has only `@Id`, slug, name, ownerId, plan, stripe ids, trialEndsAt, createdAt — no `@Version` field).
3. `mapPlan` derives the plan from `sub.getStatus()` / `sub.getItems()` on the snapshot delivered with the event — it does NOT compare against the workspace's currently-stored state nor against `event.getCreated()` or the subscription's `current_period_start`. Stripe explicitly documents at-least-once + out-of-order delivery (https://stripe.com/docs/webhooks#best-practices), so a late `customer.subscription.updated` event carrying an older `status=active` snapshot will arrive after `customer.subscription.deleted` and re-set plan to `pro` with no live subscription billing the customer (free service). Conversely, a late `deleted` after a re-subscription downgrades a paying customer to `free`.
4. Concurrent same-customer deliveries race the read-modify-write — without `@Version` Hibernate produces a last-writer-wins UPDATE, so two interleaved threads can lose the cancellation. The signature-verification 5-minute tolerance window the rationale references is unrelated — it gates replay-without-secret, not Stripe's own re-delivery.
5. `onCheckoutComplete` (line 158) has the same shape — `workspaces.findById(...).ifPresent(w -> { w.setStripeCustomerId(...); w.setStripeSubscriptionId(...); workspaces.save(w); })` — again no event-id dedup, no @Version, no @Transactional. A duplicate or out-of-order `checkout.session.completed` could swap the workspace's `stripeCustomerId` to a stale value after a customer-portal-driven change.

**Recommended fix:**
Persist `stripe_event_id` in a `processed_webhook_events` table with a unique constraint, short-circuit `webhook()` if the event id already exists, wrap each handler in `@Transactional`, add `@Version` to Workspace, and compare `event.getCreated()` (or `sub.getCurrentPeriodStart()`) against a `last_stripe_event_at` column on Workspace so an older event cannot clobber a newer one.

---

### F-RD4-07 — Monitor scheduler's HTTP check is vulnerable to DNS-rebinding TOCTOU

**Severity:** high
**Category:** DNS-rebinding TOCTOU between create-time and check-time
**Location:** api/src/main/java/io/netscope/monitor/MonitorScheduler.java:93

**Claim:** Monitor create (MonitorController.create:60) validates m.getTarget() against TargetValidator at insertion. Scheduler then runs check-time validation in tcpCheck/pingCheck (lines 105/114) — but httpCheck (line 93-101) goes through SafeHttpClient which validates host THEN hands the URI to JDK HttpClient for an independent second DNS resolve (SafeHttpClient.java:63-68). Result: validator looks up the hostname, gets 1.2.3.4 (passes), the JDK then re-resolves and dials whatever the authoritative server returns now — 127.0.0.1, 169.254.169.254, 10.0.0.x — same DNS-rebinding TOCTOU the webhook worker explicitly defends against via pinHostToAddress (WebhookDeliveryWorker.java:159), but here NOT defended. Compounded across the 30 s scheduler tick: an attacker with control over the authoritative DNS can probe arbitrary internal addresses every interval and read up/down/latency back from the dashboard.

**Bypass path:**
Confirmed DNS-rebinding TOCTOU in SafeHttpClient. C:/projects/netscope/api/src/main/java/io/netscope/common/http/SafeHttpClient.java:59-93 validates the hostname (line 63: `validator.resolveAndValidate(req.uri().getHost())`) and then passes the original hostname-bearing URI to JDK `client.send(req, ...)` at line 68. The JDK HttpClient performs its own independent DNS resolution at connect time — there is no IP pinning or Host-header rewrite. MonitorScheduler.httpCheck (C:/projects/netscope/api/src/main/java/io/netscope/monitor/MonitorScheduler.java:93-102) feeds the attacker-controlled monitor target directly into this client.

Contrast with the explicit defense in WebhookDeliveryWorker (C:/projects/netscope/api/src/main/java/io/netscope/webhook/WebhookDeliveryWorker.java:150-167), whose own comments at lines 151-158 describe exactly this TOCTOU and resolve it via `pinHostToAddress(original, validated)` + explicit Host header — replacing the hostname in the URI with the validated IP literal so the JDK cannot re-resolve. SafeHttpClient lacks both steps. tcpCheck (line 105) and pingCheck (line 114) avoid the issue because they connect directly with the validated InetAddress object, but httpCheck does not.

Exploit feedback channel: results land in monitor_checks (MonitorScheduler.java:101) and are exposed via MonitorController.history (MonitorController.java:88-105), giving an attacker a binary up/down + status-code + latency oracle on internal addresses (169.254.169.254, 127.0.0.1, RFC1918) on each scheduler tick.

Note: The same gap affects every other SafeHttpClient caller (HeadersController, CdnController, TechStackController, ReachController, RobotsController, PageFetcher) which similarly hit attacker-supplied hostnames — but the monitor case is the most acute because (a) it's scheduled and repeated and (b) the result is persisted and queryable, giving sustained recon rather than a one-shot probe.

**Recommended fix:**
Port the WebhookDeliveryWorker pinHostToAddress + explicit Host header pattern into SafeHttpClient so every outbound request connects to the validated IP literal instead of re-resolving the hostname. Add a unit test that proves a second DNS lookup is not issued (e.g. mock InetAddress lookups and assert single resolution). Apply uniformly to MonitorScheduler.httpCheck and all other SafeHttpClient callers.

---

### F-RD4-08 — IP multi-source cache uses raw user input as key, fragmenting the cache

**Severity:** low
**Category:** cache-key fragmentation / no canonicalisation
**Location:** api/src/main/java/io/netscope/ip/IpMultiSourceService.java:97

**Claim:** cacheKey = "ip-multi:" + ip uses the RAW user-supplied ip path-variable, not the canonical form produced by IpAddressGuard.parseAndGuard(ip). The sister method IpService.lookup() at IpService.java:93-95 explicitly takes addr.getHostAddress() as the cache key precisely to avoid this. Effect: "2001:DB8::1" and "2001:db8::1" (case), "::ffff:1.2.3.4" vs "1.2.3.4" (IPv4-mapped), and minor punctuation variants resolve to the SAME upstream lookup but yield distinct cache entries. Not a cross-tenant disclosure (all entries contain the same public geo data), but it is a documented inconsistency between the two IP-lookup pipelines and a clear cache-poisoning surface waste. Also: the cached map echoes back "ip": ip — the raw form — so the response embeds the user's original spelling rather than the canonicalised one, which can leak the spelling back to anyone hitting the same key.

**Bypass path:**
Confirmed at C:\projects\netscope\api\src\main\java\io\netscope\ip\IpMultiSourceService.java:95-110. Line 95 calls `IpAddressGuard.parseAndGuard(ip)` purely for its blocking side effect and DISCARDS the returned `InetAddress`. Line 97 then builds `cacheKey = "ip-multi:" + ip` using the raw path-variable, and line 110 echoes `out.put("ip", ip)` — both using the unnormalised user input. The sister pipeline in IpService.java:89-95 does it correctly: `InetAddress addr = IpAddressGuard.parseAndGuard(ip); String canonical = addr.getHostAddress();` then uses `"ip:" + canonical` as the cache key, with a code comment explicitly stating "Normalise to the canonical string form ... so the cache key is stable regardless of how the user spelled the address." The regex in IpAddressGuard line 38 (`^[0-9a-fA-F:.]+$`) accepts both upper/lowercase hex, so `2001:DB8::1` and `2001:db8::1` both pass the guard and produce two distinct cache entries that fan out separately to every upstream provider. IPv4-mapped IPv6 (`::ffff:1.2.3.4`) is also accepted by `InetAddress.getByName` and would canonicalise to `1.2.3.4` in IpService.lookup, but IpMultiSourceService keeps it as `::ffff:1.2.3.4`. Severity is correctly characterised as low: no cross-tenant disclosure (all entries hold the same public geo data) and no privacy boundary crossed, but it is a real cache-fragmentation and pipeline-inconsistency bug, exactly as the finding describes.

**Recommended fix:**
Capture the InetAddress, derive `String canonical = addr.getHostAddress();` and use that for both the cache key and the response `"ip"` field, matching IpService.lookup.

---

### F-RD4-09 — IP multi-source pre-validation regex accepts non-canonical forms

**Severity:** low
**Category:** weak ip pre-validation
**Location:** api/src/main/java/io/netscope/ip/IpMultiSourceService.java:166

**Claim:** isValidIp() at line 163-167 uses regex "^[0-9a-fA-F:.]{2,45}$" — this permits strings that are syntactically NOT valid IPs (e.g. ":::::", "....", "abc.def", "ffff:gggg" is blocked but "ffff:eeee:dddd" passes). The follow-up IpAddressGuard.parseAndGuard catches truly invalid inputs at line 95, BUT the cache key is built from the raw ip AFTER both checks — so any string that parseAndGuard happens to accept (including non-canonical equivalents like "2001:0db8:0000:0000:0000:0000:0000:0001" vs "2001:db8::1") ends up as a distinct cache key for the same actual address. This is the same root cause as finding #3 but from a different angle: there's no normalisation step that funnels every spelling into a single canonical form before the cache key is built. IpService.lookup() does this correctly; IpMultiSourceService does not.

**Bypass path:**
Verified at api/src/main/java/io/netscope/ip/IpMultiSourceService.java:86-118. The bypass path is concrete: (1) isValidIp() at line 166 uses a permissive regex that admits any IPv6-ish string; (2) line 95 calls IpAddressGuard.parseAndGuard(ip) but throws away the returned InetAddress — it's a bare statement, not an assignment; (3) line 97 builds cacheKey from the raw user input ("ip-multi:" + ip), and line 110 stores the raw spelling under the "ip" key. Inputs like "2001:0db8:0000:0000:0000:0000:0000:0001" (39 chars) and "2001:db8::1" (11 chars) both match ^[0-9a-fA-F:.]{2,45}$, both parse via InetAddress.getByName() as the same address, and both are passed by IpAddressGuard.isBlocked() (public IPv6 unicast). The result: two distinct Redis keys, two independent fan-outs across every registered IpSourceFetcher, double the upstream quota burn, divergent cached aggregates. Compare with IpService.lookup() at lines 88-95, which correctly does `InetAddress addr = IpAddressGuard.parseAndGuard(ip); String canonical = addr.getHostAddress();` and keys the cache on canonical — every equivalent spelling collapses to the same slot. Mixed-case IPv6 ("2001:DB8::1" vs "2001:db8::1") and IPv4-mapped-IPv6 forms compound the duplicate-key count further. No normalisation step exists in the multi-source path. Severity-low is appropriate: no auth bypass, no data leak — but the wasted upstream quota and the explicit asymmetry with IpService's behaviour (which the F-02 comment at lines 88-94 specifically intended to mirror) are real.

**Recommended fix:**
One-line fix: `InetAddress addr = IpAddressGuard.parseAndGuard(ip); String canonical = addr.getHostAddress();` then use `canonical` for cacheKey and the response "ip" field. This collapses every equivalent spelling onto the same Redis slot and matches IpService.lookup's behaviour.

---

## Methodology

Static scan + adversarial verify (same as rounds 1, 2, and 3). Round 4 widened the surface to insecure direct object reference (IDOR) patterns across every workspace-scoped resource, race conditions in billing / webhook / read-modify-write paths, email-header / envelope injection in outbound notification senders, path-traversal in any controller that builds a Path or File from user input, cache-key fragmentation and poisoning in Redis-backed lookup pipelines, and pre-authentication information disclosure (403-vs-404 oracles, response timing, error-message differential). Each raw finding was traced end-to-end through controller → service → repository → outbound client, with in-repo "good" patterns (e.g. MonitorController's `findByIdAndApiKeyId`, WebhookDeliveryWorker's `pinHostToAddress`, IpService's canonicalised cache key) used as the bar for "this can be fixed with an existing pattern." False positives were retired when an existing guard (e.g. atomic ownership query, DB unique constraint, `@Transactional` boundary, canonicalisation step, uniform error wrapper) defeated the proposed attack path.
