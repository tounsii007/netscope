# Security Review — 2026 Q2, Round 5

**Reviewer:** workflow-driven adversarial scan, round 5 (retry of W20 after harness fail)
**Date:** 2026-05-31
**Scope:** Actuator + CORS + Tomcat + tx isolation + side channels + PII paths.

## Round-5 vs prior

R1: input-validation / SSRF / error / auth-rl → 6 confirmed (fixed in PR #39).
R2: XXE / open-redirect / timing / log-PII / header-injection / DoS → 8 (fixed PR #39).
R3: JWT / OAuth / CSRF-session / mass-assign / TLS-outbound / Stripe-replay → 6 (fixed PR #39).
R4: IDOR / race / email-injection / path-traversal / cache-poisoning / pre-auth disclosure → 9 (fixed PR #39).
Frontend: XSS / CSP / storage / open-redirect / link-rel / postMessage → 7 (fixed PR #40).
R5 (this report): Spring Actuator / CORS / request smuggling / tx isolation / side channels / privacy paths.

## Summary

- Dimensions: 6
- Raw findings: 24
- Adversarially verified: 12
- Confirmed real: 6
- False positives: 6

## Confirmed findings

### F-RD5-01 — CSP connect-src built by raw string concatenation from NEXT_PUBLIC_API_URL with no validation

**Severity:** medium
**Category:** csp-connect-src-no-validation
**Location:** web/next.config.ts:71

**Claim:** Frontend CSP connect-src is built by raw string concatenation from NEXT_PUBLIC_API_URL with no validation: `"connect-src 'self' " + (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080") + " api.pwnedpasswords.com"`. A deployment that sets NEXT_PUBLIC_API_URL to a wildcard form (e.g. `https://*.netscope.io` or `https:`), to a value with whitespace/multiple URLs, or to an unintended host silently expands the connect-src source list. The same pattern is mirrored in web/lib/csp.ts:94 for the per-request nonce CSP, so a misconfigured env var compromises BOTH the static fallback CSP and the dynamic HTML CSP. There is no allowlist check on the env value at boot — the CSP just inherits whatever string is set, with `??` only catching `null`/`undefined` (empty string slips through and yields `connect-src 'self'  api.pwnedpasswords.com` with a stray double space, which is still a valid CSP). This effectively makes the connect-src for our own API a wildcard-by-deployment-mistake rather than a code-enforced exact origin.

**Bypass path:**
Both sinks (web/next.config.ts:71 and web/lib/csp.ts:94) concatenate process.env.NEXT_PUBLIC_API_URL raw into connect-src with only `??` null-coalescing and no allowlist/normalizer/boot-time validator, while the analogous backend path (CorsPolicy.java) explicitly throws IllegalStateException on `'*'` — so a deployment env-var typo silently widens the CSP source list on both static and dynamic policies.

**Recommended fix:**
Introduce a boot-time validator for NEXT_PUBLIC_API_URL (e.g. in a `lib/env.ts` module imported by both `next.config.ts` and `lib/csp.ts`) that: (1) parses the value with `new URL(...)` and throws on parse failure, (2) rejects wildcards, schemes-only values, whitespace, and multi-host strings, (3) enforces an allowlist of expected production/staging hostnames (or at minimum requires `https:` outside dev), (4) normalizes to `<scheme>://<host>[:<port>]` form before concatenation. Mirror the `CorsPolicy.java` pattern of failing hard at boot rather than at request time. Treat empty string the same as null.

---

### F-RD5-02 — OPTIONS permitAll pattern fragility + auth rate-limit DoS via cross-origin preflight

**Severity:** low
**Category:** options-permitall-pattern-fragility
**Location:** api/src/main/java/io/netscope/config/SecurityConfig.java:66

**Claim:** `.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()` is placed AFTER `EndpointRequest.toAnyEndpoint().denyAll()` and BEFORE the public-route permitAll lines. With current `.anyRequest().permitAll()` this is a no-op — every non-actuator request is already permitAll, and Spring's CORS infrastructure handles preflights via the CorsFilter before authorization rules are evaluated for the inner request. But the pattern is a footgun if `.anyRequest().permitAll()` is ever tightened to `.authenticated()` or a role check: OPTIONS for ANY path (including private ones) would still be permitted, which lets an unauthenticated attacker enumerate which endpoints exist via differential responses to OPTIONS (CORS preflight 200/204 vs 404). The current SessionFilter/ApiKeyFilter chain runs on OPTIONS too (RateLimitFilter does NOT skip OPTIONS at api/src/main/java/io/netscope/common/ratelimit/RateLimitFilter.java:52-89), so OPTIONS preflights also burn the auth-endpoint rate-limit budget keyed by IP (api/src/main/java/io/netscope/common/ratelimit/RateLimitFilter.java:66) — an attacker with a controlled malicious origin can DoS a victim user's /api/v1/auth/** budget by causing the victim's browser to issue cross-origin preflights.

**Bypass path:**
Confirmed: RateLimitFilter at line 52-89 has no OPTIONS skip and runs before Spring's CorsFilter (custom filters are chained off RequestIdFilter via addFilterAfter), so cross-origin preflights to /api/v1/auth/** from an attacker-controlled origin force the victim's browser to consume their IP-keyed authEndpointPerMinute budget (default 10/min) on line 95, enabling browser-mediated DoS of the victim's sign-in flow — and the permitAll(OPTIONS, "/**") is a latent enumeration footgun if .anyRequest().permitAll() is ever tightened.

**Recommended fix:**
(1) In `RateLimitFilter.doFilterInternal`, add an early-return for `HttpMethod.OPTIONS` so preflights do not debit the per-IP auth budget. (2) Remove the broad `.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()` and rely on Spring's CorsFilter to handle preflights before authorization; if a permit is required, scope it to specific path prefixes that match the CORS policy. (3) Add a regression test that fires OPTIONS at `/api/v1/auth/start` from a disallowed origin and asserts the per-IP bucket is unchanged.

---

### F-RD5-03 — Static fallback CSP allows `script-src 'self' 'unsafe-inline'`, neutralizing XSS protection on middleware-bypass paths

**Severity:** low
**Category:** static-csp-script-src-unsafe-inline
**Location:** web/next.config.ts:67

**Claim:** Static CSP fallback in next.config.ts:67 declares `script-src 'self' 'unsafe-inline'`. The file comments (lines 26-64) explicitly call this out as a documented defense-in-depth fallback for non-HTML routes that bypass the per-request nonce middleware (e.g. middleware-matcher regression, edge runtime errors, error pages served before middleware, the 503 maintenance page). The comment says "defence-in-depth: if a future bug makes the middleware skip a request […] the static CSP is the safety net". However, that safety net is a NOT-safety-net for script execution — `script-src 'self' 'unsafe-inline'` is effectively the same as no XSS protection at all for any HTML the static CSP applies to. If the middleware ever skips an HTML response (regression, edge runtime crash, error page), that HTML inherits this static CSP and an attacker-controlled `<script>...</script>` injected via stored or reflected XSS would execute. The documented intent ("hard-to-debug works-on-static-breaks-on-dynamic") is real, but the static CSP as written does not constrain inline scripts at all. The safer baseline would be `script-src 'self'` (no 'unsafe-inline') for the static fallback — only the middleware-nonce CSP needs to permit nonce'd inlines.

**Bypass path:**
The static fallback CSP at web/next.config.ts:67 ships `script-src 'self' 'unsafe-inline'`, which provides zero XSS protection against same-origin inline-script injection on any HTML response that bypasses middleware (error pages, boot-time/edge-runtime crashes, the 503 page) — and since these fallback HTML responses are framework-rendered and don't need un-nonced inline scripts, the safer baseline `script-src 'self'` would still work, making the current value an avoidable defense-in-depth gap (the in-file comment also misstates the protection as blocking "third-party inline scripts," which is wrong — `'self'` already does that, and `'unsafe-inline'` permits the actual same-origin XSS sink).

**Recommended fix:**
Drop `'unsafe-inline'` from the static fallback `script-src` and ship `script-src 'self'`. Verify in CI by hitting the error-page route and the maintenance-page route with `curl -I` and asserting the response CSP omits `'unsafe-inline'`. Update the in-file comment to accurately describe the protection (the static fallback now prevents both third-party AND same-origin inline-script execution; the nonce-CSP from middleware is what permits nonce'd inline scripts on normal page renders). If a Next.js framework page genuinely emits un-nonced inline script on the error path, fix the framework usage rather than weakening the CSP.

---

### F-RD5-04 — X-Forwarded-* over-trust: Tomcat's default RemoteIpValve trusts entire RFC1918 space, enabling sibling-container XFF spoofing

**Severity:** medium
**Category:** X-Forwarded-* over-trust / no internal-proxy allowlist
**Location:** api/src/main/resources/application.yml:28

**Claim:** server.forward-headers-strategy: native is enabled but server.tomcat.internal-proxies / remoteip.* is never customised. Tomcat's default RemoteIpValve trusts the full RFC1918 range (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254/16, 127.0.0.0/8) as 'internal proxies'. In the deployed docker-compose (RUNNING.md sect. C4-C5) the 'api' container shares the 'web' user-defined bridge network with both nginx AND the Next.js 'web' container — every container on that bridge gets a 172.x address inside the trusted regex. A compromised or malicious sibling container (e.g. the Next.js web container, or any future sidecar) can send a request directly to api:8080 with a forged 'X-Forwarded-For: <victim_ip>' header, and Tomcat will rewrite getRemoteAddr() to that spoofed value. Downstream consequences confirmed by code-reads: (a) ClientIpResolver.clientIp() trusts getRemoteAddr() blindly; (b) RateLimitIdentity.of() keys the rate-limit bucket on that IP — so an attacker with an in-network foothold can pin auth-endpoint quota (10/min in application.yml line 107) to any victim IP and lock real users out of /api/v1/auth/* (denial-of-service on login); (c) RateLimitFilter.enforceAuthTier also keys on that IP, so the credential-stuffing throttle is bypassable by simply rotating the spoofed XFF for every attempt; (d) SecurityAuditService and AccessLogFilter attribute the audit row + access log to the spoofed IP, contaminating the incident-response trail.

**Bypass path:**
application.yml only sets `forward-headers-strategy: native` with no `server.tomcat.remoteip.internal-proxies` override, so Tomcat's RemoteIpValve uses its default regex that trusts the entire RFC1918 space (incl. 172.16/12), and in the RUNNING.md C4 compose the api container shares the `web` bridge network with the Next.js `web` container and any future sidecar — meaning a compromised/malicious sibling at any 172.x address can forge `X-Forwarded-For`, have getRemoteAddr() rewritten to a victim IP, and poison RateLimitFilter.enforceAuthTier (`rl:auth:<spoofed>` to lock victims out of /api/v1/auth/* at 10/min), bypass the same throttle for credential-stuffing by rotating XFF, and corrupt SecurityAuditService rows + AccessLogFilter lines — all sinks are reachable, ClientIpResolver/RateLimitIdentity have no extra validation, and the trust boundary is genuinely violated by the docker-compose topology.

**Recommended fix:**
Pin `server.tomcat.remoteip.internal-proxies` to the exact CIDR/IPs of the trusted edge proxies (nginx ingress only) — e.g. the docker network gateway address or the dedicated `ingress` bridge subnet — and NOT the entire RFC1918 space. In the production compose, place the api container on a dedicated `internal` network with ONLY nginx attached, and keep the Next.js web container on a separate network that does not have direct TCP reachability to api:8080. Add an integration test that boots the stack, sends a request from a non-trusted sibling container with a forged XFF, and asserts `getRemoteAddr()` returns the actual peer IP — not the spoofed XFF value. Also enforce `server.tomcat.remoteip.trusted-proxies` so any header from an untrusted source is dropped entirely rather than logged.

---

### F-RD5-05 — Webhook delivery worker releases SELECT FOR UPDATE lock before HTTP send completes, enabling double-delivery

**Severity:** critical
**Category:** tx-isolation / double-delivery
**Location:** api/src/main/java/io/netscope/webhook/WebhookDeliveryWorker.java:102

**Claim:** WebhookDeliveryWorker.tick() declares @Transactional with the explicit intent of holding the SELECT FOR UPDATE SKIP LOCKED lock 'during dispatch' (see comment line 101 and WebhookDeliveryRepository.java line 31). But the dispatch is immediately offloaded to a virtual-thread executor via exec.submit(() -> { ...; send(d); ...}). JPA/JDBC transactions are thread-bound — the moment tick() returns (within microseconds of the submit calls), the @Transactional method completes, the SELECT FOR UPDATE row locks are released, and only THEN do the virtual threads start running send(), which does its own out-of-tx repo writes (deliveries.save, webhooks.save). Two consequences: (1) the next 5-second tick of the same pod can re-fetch the same 50 rows because succeededAt/deadAt are still null; (2) any sibling replica's tick can grab those same rows after the brief tick-method tx releases — SKIP LOCKED no longer helps once the lock is gone. Net effect: duplicate POSTs of the same WebhookDelivery to customer endpoints, exactly the failure mode the @Lock(PESSIMISTIC_WRITE) was meant to prevent. Stripe/Slack/Discord webhook URLs that are not idempotent (most aren't) will see duplicated alerts and PagerDuty pages.

**Bypass path:**
@Transactional on tick() releases the SELECT FOR UPDATE SKIP LOCKED row locks the moment the method returns (microseconds after exec.submit() hands work to virtual threads), so the HTTP send() and its succeededAt/deadAt writes run outside the tx with no lock — letting the next tick on this pod or any sibling replica re-fetch the same rows and double-POST to customer webhooks.

**Recommended fix:**
Two-phase claim-then-send pattern: (1) inside the @Transactional tick(), SELECT FOR UPDATE SKIP LOCKED the candidate rows AND mark them with a `claimed_at` timestamp + `claimed_by` worker UUID before the tx commits — so the moment the lock releases the rows are visibly claimed and other pollers skip them. (2) Move the HTTP send onto the virtual-thread executor as today, but have each task do its own @Transactional write to update succeededAt/deadAt/attemptedAt at the end. (3) Add a separate sweeper job that reclaims rows where `claimed_at < now() - lease_ttl` AND succeeded_at IS NULL AND dead_at IS NULL (handles worker crash mid-send). (4) Add a unique idempotency key to WebhookDelivery (e.g. `(webhook_id, event_id)`) and propagate it as the `X-Idempotency-Key` HTTP header on outbound POSTs so customers can dedupe even if double-delivery slips through. (5) Regression test: spin up two workers against the same DB and assert exactly one POST per delivery row.

---

### F-RD5-06 — CT scheduler runs non-transactional, non-versioned, non-locked across replicas; LWW race can roll watermark backward

**Severity:** high
**Category:** tx-isolation / double-delivery + non-atomic counter
**Location:** api/src/main/java/io/netscope/ctmonitor/CtScheduler.java:104

**Claim:** CtScheduler.poll(s) is not @Transactional, takes no DB-side lock on the ct_subscriptions row, and runs on a @Scheduled(fixedDelay = 600_000) timer across every replica. CtSubscription (CtSubscription.java line 10) has no @Version. The body does findById-equivalent → in-Java compare against lastSeenId → for-loop emitting obs.save() + events.publishEvent(WebhookPublisher.DomainEvent ct.new_cert) → finally subs.save(s) with the new high-water mark. Two replicas ticking in the same 10-minute window both: (a) read lastSeenId = N, (b) fetch the same crt.sh JSON, (c) emit the same ct.new_cert event to WebhookPublisher (which fans out to every customer webhook), and (d) write lastSeenId = M back via two non-atomic UPDATEs. There is no idempotency log on CtObservation either (no unique constraint on (subscription_id, crtsh_id) — see CtObservation.java lines 13-22), so duplicate rows persist AND duplicate webhook deliveries get enqueued for every new certificate detected. Beyond duplicates, the LWW race on lastSeenId can SILENTLY ROLL THE WATERMARK BACKWARD (replica A writes the higher M just after replica B writes the lower M from its earlier crt.sh snapshot), causing the next tick to re-emit certificates it has already alerted on.

**Bypass path:**
CtScheduler.poll() at line 104 is not @Transactional, takes no row-lock, CtSubscription has no @Version, and runs on @Scheduled across every replica — the LWW watermark race that silently rolls lastSeenId backward and the missing @Async/transactional idempotency around publishEvent are real and reachable; the claim slightly overstates by ignoring the DB-level UNIQUE(subscription_id, crtsh_id) on ct_observations (V3__platform.sql:150), but that constraint only prevents duplicate observation rows — it does not stop duplicate webhook_deliveries from being enqueued on subsequent ticks after a watermark rollback (WebhookDelivery has no idempotency key), and the in-loop unique-violation actually creates a worse livelock by aborting before subs.save(s) runs.

**Recommended fix:**
(1) Wrap poll(s) in @Transactional with PESSIMISTIC_WRITE on the ct_subscriptions row (SELECT FOR UPDATE) at the very start, so concurrent ticks across replicas serialize per subscription. (2) Add `@Version Long version` to CtSubscription as a defensive optimistic-lock backstop in case the pessimistic lock path is bypassed. (3) Enforce a monotonic-write invariant on lastSeenId: persist with `UPDATE ct_subscriptions SET last_seen_id = :new WHERE id = :id AND (last_seen_id IS NULL OR last_seen_id < :new)` so a stale snapshot can NEVER overwrite a fresher watermark. (4) Add an idempotency key on WebhookDelivery (e.g. `(subscription_id, crtsh_id, event_type)`) with a unique constraint so the worker queue cannot enqueue the same logical delivery twice even if the upstream poll() raced. (5) Restructure the inner loop so a unique-violation on ct_observations does NOT abort the watermark advance — catch DataIntegrityViolationException per-cert, log a metric, and continue so subs.save(s) still runs at the end. (6) Add an integration test that runs two CtScheduler instances against the same DB with a stubbed crt.sh response and asserts exactly one webhook_delivery row per new cert.

---

## Cumulative session totals (after this round)

- Backend R1: 6 confirmed (fixed)
- Backend R2: 8 confirmed (fixed)
- Backend R3: 6 confirmed (fixed)
- Backend R4: 9 confirmed (fixed)
- Backend R5: 6 confirmed
- Frontend pass: 7 confirmed (fixed)
- **Total: 42 real vulnerabilities surfaced across 6 review rounds.**

## Methodology

Static scan + adversarial verify, NOT a pen-test. Open recommendations:
- Dynamic-payload fuzzing (Playwright + payloads against a running instance)
- Dependency-CVE pass via OSV-Scanner + npm audit + mvn dependency:check
- Stateful flow testing for IDOR + race conditions a static reader cannot prove
