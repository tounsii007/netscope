# Security Review — 2026 Q2, Round 2

**Reviewer:** workflow-driven adversarial scan, round 2 (NEW dimensions vs round 1)
**Date:** 2026-05-30
**Scope:** every @RestController + supporting services under api/src/main/java/io/netscope/

## Round-2 vs Round-1

Round 1 (docs/security-review-2026q2.md) covered input-validation, SSRF,
error-disclosure, auth-rate-limit. Round 2 expands the surface to:

- XXE / Jackson deserialisation
- Open redirect
- Timing attacks (HMAC, API-key, password)
- Logging-PII / credential leakage
- HTTP response splitting / header injection
- Resource exhaustion / DoS

## Summary

- Dimensions scanned: 6
- Raw findings (pre-verification): 15
- After dedup: 15
- Adversarially verified: 15
- Confirmed real: 8
- False positives: 7

## Confirmed findings

### F-RD2-01 — WebhookDeliveryWorker SSRF-block WARN leaks Slack/Discord webhook token in URL

**Severity:** high
**Category:** credential-in-log
**Location:** api/src/main/java/io/netscope/webhook/WebhookDeliveryWorker.java:114

**Claim:** Slack/Discord webhook URLs embed a bearer-equivalent token in the URL path (https://hooks.slack.com/services/T.../B.../XXXXXXXX, https://discord.com/api/webhooks/<id>/<token>), and this WARN line writes wh.getUrl() in full whenever the SSRF re-check trips — leaking the upstream signing/posting token to anyone with access to the application log.

**Bypass path:**
Real bug. The webhook controller (api/src/main/java/io/netscope/webhook/WebhookController.java line 26) accepts kind=slack|discord|pagerduty|generic and stores req.url() verbatim (line 50). For Slack (https://hooks.slack.com/services/T.../B.../TOKEN) and Discord (https://discord.com/api/webhooks/<id>/<token>) the URL path itself is a bearer-equivalent posting credential — anyone with the URL can post to that channel/webhook. WebhookDeliveryWorker.send() at line 131 writes the full URL into a WARN log on the SSRF re-check trip: `log.warn("Blocked SSRF attempt via webhook {} → {}", wh.getId(), wh.getUrl())`. No redaction or sanitisation happens between the entity and the log call (Webhook.getUrl() at Webhook.java line 28 returns the stored string unchanged). The same pattern repeats at line 259: `log.warn("Webhook {} dead after {} attempts", wh.getUrl(), next)` — which is even easier to reach (any webhook that 4xx/5xx-loops six times leaks the URL with no SSRF rebinding needed at all). Both lines already have wh.getId() (a UUID) available as a safe identifier; logging the URL is unnecessary. Attack path: user creates a Slack webhook with a real token; either (a) the upstream DNS later resolves to a blocked IP (rebinding, operator changes BlockedAddressRules CIDRs, etc.) → line 131 fires, or more reliably (b) the Slack endpoint starts returning errors and retries exhaust → line 259 fires; in both cases the secret token in the URL path lands in the application log, where anyone with log-read access (ops engineers, log-shipping pipeline, SIEM, on-call) can replay it to post to that channel.

**Recommended fix:**
Drop `wh.getUrl()` from both warn calls and rely on `wh.getId()` (a UUID), or hash/truncate the URL path before logging.

---

### F-RD2-02 — WebhookDeliveryWorker dead-letter WARN leaks webhook URL after retry exhaustion

**Severity:** high
**Category:** credential-in-log
**Location:** api/src/main/java/io/netscope/webhook/WebhookDeliveryWorker.java:185

**Claim:** scheduleRetry's 'Webhook {} dead after {} attempts' logs wh.getUrl() once delivery fails MAX_ATTEMPTS times; the same Slack/Discord/generic webhook URLs that embed secrets in the path get written to log every time a target endpoint stays down long enough to exhaust retries.

**Bypass path:**
Real exploitable issue (cited at line 185, but actual sink is at api/src/main/java/io/netscope/webhook/WebhookDeliveryWorker.java:259). `scheduleRetry` invokes `log.warn("Webhook {} dead after {} attempts", wh.getUrl(), next)` with the raw URL when a delivery has burned through all MAX_ATTEMPTS=6 retries. Trace: `WebhookController.create` -> `validateWebhookUrl` only checks scheme/host/SSRF and never strips path/query, so a Slack URL `https://hooks.slack.com/services/T.../B.../XXXX` or Discord URL `https://discord.com/api/webhooks/{id}/{token}` (whose path itself is the bearer credential) is stored verbatim in `webhooks.url`. `tick` -> `send` -> on any HTTP non-2xx or exception -> `scheduleRetry` -> at attempt 6 -> logs `wh.getUrl()` to the `io.netscope.webhook` logger, which logback-spring.xml fans out to `webhook.YYYY-MM-DD.log` (30-day retention), `ASYNC_SERVER` (server.log, 30d), `ASYNC_ERROR` (error.log, 90d) and CONSOLE — no PatternLayout converter masks URLs and no `toString`/getter wrapper redacts the path. No attacker is needed to trigger: any receiver outage long enough for the ~1m+5m+30m+2h+6h+24h backoff to exhaust (~33h) writes the full token-bearing URL into multiple log files. Anyone with log read access can replay POSTs to the Slack/Discord channel. Sibling log at line 131 ("Blocked SSRF attempt via webhook ... -> ...") has the same shape but is a separate sink; this claim correctly identifies the dead-letter WARN as the leak.

**Recommended fix:**
Replace `wh.getUrl()` in the dead-letter WARN with `wh.getId()` (or a hashed/truncated form of the URL), so retention-bound log files never persist Slack/Discord bearer tokens.

---

### F-RD2-03 — IpService.fetchFromIpinfo has no HTTP timeout, no body cap, and no effective TimeLimiter

**Severity:** high
**Category:** unbounded-http-client
**Location:** C:\projects\netscope\api\src\main\java\io\netscope\ip\IpService.java:27

**Claim:** IpService uses `RestClient.create()` and `HttpClient.newHttpClient()` with no connect/read timeouts and no body-size cap; the `fetchFromIpinfo` call materializes the full upstream response into a String via `body(String.class)`, and although the surrounding method is `@CircuitBreaker(name="ipinfo")` there is no `@TimeLimiter` annotation, so the `resilience4j.timelimiter.instances.ipinfo` config in application.yml is never applied. A slow/tarpit/oversized response from a configured `netscope.geoip.ipinfo-base-url` (or from real ipinfo.io via MITM / mocked test override) hangs the request thread indefinitely and loads unbounded bytes into heap.

**Bypass path:**
Verified the code defects exactly as claimed: (1) IpService.java:27 `RestClient.create()` constructs a default RestClient with no connect/read timeout; (2) line 146 `rest.get().uri(url).retrieve().body(String.class)` materializes the full upstream response into a String with no body-size cap; (3) line 141 has only `@CircuitBreaker(name="ipinfo")` and `grep -r @TimeLimiter` returns zero matches anywhere in the codebase, so the `resilience4j.timelimiter.instances.ipinfo: timeoutDuration: 5s` block in application.yml is dormant config. The `@CircuitBreaker` cannot help with hung calls because it only counts failures after they return — a thread blocked indefinitely on a tarpit socket never increments the failure-rate counter, so the breaker never opens. Attack path: `ipinfoBaseUrl` is sourced from `netscope.geoip.ipinfo-base-url` (line 40) which is overridable via env var/property and is in fact wired to WireMock in IpServiceCircuitBreakerTest.java:36 — so any deployment misconfiguration, supply-chain tampering, or genuine upstream slowness from real ipinfo.io will cause each cache-miss /api/v1/ip/{ip} request to pin a Tomcat HTTP worker indefinitely and load unbounded response bytes into heap. Upstream `IpAddressGuard.parseAndGuard` correctly rejects reserved/internal IPs but only validates the user-supplied IP — it does nothing to bound the outbound HTTP call to ipinfoBaseUrl. The companion `SafeHttpClient` (which does set connectTimeout(5s) and has TargetValidator on redirects) is deliberately not used here. Note: the secondary `HttpClient http = HttpClient.newHttpClient()` at line 28 is only used by `loadTorList()` which DOES set `.timeout(Duration.ofSeconds(10))` on the request itself and runs async via CompletableFuture, so that path is OK — the bug is specifically the synchronous RestClient call in fetchFromIpinfo.

**Recommended fix:**
Build the `RestClient` with an explicit `JdkClientHttpRequestFactory` configured for `connectTimeout(5s)` + `readTimeout(5s)`, wrap the response in a `BodyHandlers.limiting`-style cap, and add `@TimeLimiter(name="ipinfo")` so the existing application.yml timelimiter config actually fires.

---

### F-RD2-04 — BgpController's RIPE RestClient has no timeouts and no effective circuit-breaker config

**Severity:** high
**Category:** unbounded-http-client
**Location:** C:\projects\netscope\api\src\main\java\io\netscope\bgp\BgpController.java:36

**Claim:** BgpController's lazy RestClient is built with `RestClient.builder().defaultHeader(...).build()` — no requestFactory, so the default `JdkClientHttpRequestFactory` is used with no connectTimeout and no readTimeout. The `ripe()` helper reads the full response into a String and calls `mapper.readTree(body)` with no body-size cap. Each /api/v1/bgp/ip/{ip} or /asn/{asn} fires three sequential `ripe()` calls; a slow or hostile stat.ripe.net (no MITM needed for the asn/ip path which is path-injected straight into the URL) can pin an HTTP worker forever.

**Bypass path:**
Confirmed real defect at BgpController.java:36. The lazy RestClient is built with `RestClient.builder().defaultHeader("User-Agent", "NetScope/1.0").build()` — no `.requestFactory(...)`, so Spring uses the default `JdkClientHttpRequestFactory` with NO connectTimeout and NO readTimeout. The `ripe()` helper at line 114-120 calls `.retrieve().body(String.class)` with no size cap and no per-call deadline. Each `/api/v1/bgp/ip/{ip}` and `/asn/{asn}` fires three sequential `ripe()` calls (lines 51-53, 86-88). Guard analysis: (1) the path-param regex `^[0-9a-fA-F:.]+$` / `\d+` only validates IP/ASN format — it doesn't gate the outbound call destination, which is the fixed `stat.ripe.net` host the attacker doesn't control but can trigger slowness on. (2) `@CircuitBreaker(name = "ripe")` is referenced, but `application.yml` lines 153-176 only define circuitbreaker instances for `ipinfo`, `crtsh`, `rdap` — there is NO `ripe` instance, so resilience4j uses default config which does NOT enforce a per-call timeout, only failure-rate counting (and a hang produces no exception to count). (3) The `timelimiter` block (lines 169-176) likewise has no `ripe` entry. (4) `spring.mvc.async.request-timeout: 30s` doesn't apply because the endpoints are synchronous (return `Map<String, Object>` directly, not `Callable`/`CompletableFuture`). (5) `SafeHttpClient` (the wrapper with a 5s connectTimeout) is NOT used here — BgpController uses raw `RestClient`. Attack path: attacker hits `/api/v1/bgp/ip/8.8.8.8` repeatedly during any stat.ripe.net slowdown (RIPE outage, network partition, or natural slow response) → the worker hangs in `client.send` indefinitely with no automatic recovery → connection slots and the JDK HttpClient's underlying resources accumulate. The claim's specific "400 Tomcat worker pool" framing is slightly weaker than stated because `spring.threads.virtual.enabled: true` mitigates OS-thread starvation, but the underlying defect (no outbound HTTP timeout, no per-call cap at any layer, breaker never opens because no exception fires) is genuine and fixable by adding a `JdkClientHttpRequestFactory` with explicit connect/read timeouts (matching the pattern already used in `IpMultiSourceService`, `SubdomainHttpClient`, and `CtScheduler`).

**Recommended fix:**
Configure the BgpController `RestClient` with a `JdkClientHttpRequestFactory` carrying explicit `connectTimeout(5s)` / `readTimeout(10s)`, add a `ripe` circuitbreaker + timelimiter entry to `application.yml`, and cap the response body size in `ripe()` before `mapper.readTree`.

---

### F-RD2-05 — TechStackController buffers full upstream HTML before its 200 KB cap, enabling OOM

**Severity:** medium
**Category:** unbounded-response-body
**Location:** C:\projects\netscope\api\src\main\java\io\netscope\tech\TechStackController.java:112

**Claim:** TechStackController.detect uses `HttpResponse.BodyHandlers.ofString()` which materializes the entire upstream HTML into a JVM String *before* the in-process `if (body.length() > 200_000) body = body.substring(0, 200_000)` cap is applied. A malicious target host can serve a multi-GB chunked response and trigger OOM. SafeHttpClient does not impose a body-size limit either (it only re-validates redirects).

**Bypass path:**
Real bug. Attack path: attacker registers/controls a public host (passes TargetValidator.resolveAndValidate which only blocks private/internal IPs) → calls GET /api/v1/tech/{evil.example.com} → TechStackController.detect calls http.send(..., HttpResponse.BodyHandlers.ofString()) at line 109-112 → SafeHttpClient.send (despite its misleading "caps response size" docstring) just forwards the BodyHandler unchanged to the underlying JDK HttpClient, only re-validating hosts on redirects → JDK HttpClient with ofString() buffers the ENTIRE chunked response body into a single JVM String before returning → only AFTER full materialization does line 118 (`if (body.length() > 200_000) body = body.substring(0, 200_000)`) apply truncation. The 10-second request timeout does not save you because the attacker can stream gigabytes at high throughput within 10s. There is no Content-Length pre-check, no BodyHandlers.limiting wrapper, and no streaming consumption. A 2 GB chunked response will exhaust the heap and OOM the process. Note the same pattern is duplicated across 6+ other controllers (CtLogsController, IpService, RobotsController, WhoisController, WebhookDeliveryWorker, PageFetcher's caller path) — only CtScheduler (MAX_BODY_BYTES=8MB) and PageFetcher (MAX_BODY=500_000 applied after-the-fact, which is the same anti-pattern) try to guard, and even those guards are too late. The fix is to either (a) make SafeHttpClient enforce the size cap by wrapping the handler in BodyHandlers.limiting/ofByteArrayConsumer-with-cutoff that throws on overflow, or (b) check Content-Length pre-read and reject oversized declarations while wrapping unknown-length responses in a counting subscriber.

**Recommended fix:**
Make `SafeHttpClient.send` enforce the documented body-size cap by wrapping the user-supplied BodyHandler in a counting subscriber that throws once N bytes are received, and pre-check `Content-Length` for declared-oversize responses.

---

### F-RD2-06 — RobotsController.analyze iterates an attacker-controlled sitemap list with no count cap

**Severity:** medium
**Category:** user-bounded-loop
**Location:** C:\projects\netscope\api\src\main\java\io\netscope\pageinsight\RobotsController.java:38

**Claim:** RobotsController.analyze iterates over `sitemapUrls`, a list parsed straight from the target site's robots.txt without any upper bound on count. Each iteration calls `fetchSitemap(sm)`, which performs a fresh HTTPS GET with a 10 s timeout and `BodyHandlers.ofString()` (no body cap). An attacker controlling the target can publish a robots.txt with thousands of `Sitemap:` directives pointing at slow URLs, causing the controller to sequentially burn 10 s per entry and pull megabytes per entry — pinning the HTTP worker for minutes per request.

**Bypass path:**
REAL. Attack path: attacker hosts attacker.example with a robots.txt containing N `Sitemap: https://slow.attacker.example/x` lines. parseRobots() at api/src/main/java/io/netscope/pageinsight/RobotsController.java:82 unconditionally `sitemaps.add(v)` for every Sitemap directive (no size cap on the parsed list, and parseRobots runs on the FULL body — the 10k truncation at line 58 only affects the `raw` echo field). analyze() at line 38 then runs `for (String sm : sitemapUrls) sitemaps.add(fetchSitemap(sm))` sequentially with no bound on the list size. fetchSitemap (line 99) calls http.send with `Duration.ofSeconds(10)` and `BodyHandlers.ofString()`. SafeHttpClient (api/src/main/java/io/netscope/common/http/SafeHttpClient.java) does NOT enforce a response-body cap despite its javadoc claiming so — it simply forwards `BodyHandlers.ofString()` to the underlying HttpClient. TargetValidator only blocks private/loopback/cloud-metadata IPs; the attacker's slow public host passes. RateLimitFilter limits requests per minute, not CPU time, so one request can pin a Tomcat worker for N*10s while pulling unbounded megabytes per entry. No guard blocks: (a) sitemapUrls.size(), (b) per-iteration body size, (c) total request wall-clock. Bug is exploitable as the claim describes.

**Recommended fix:**
Cap `sitemapUrls` to a small constant (e.g. `.stream().distinct().limit(20)`) inside `parseRobots`/before the analyze loop, and wrap `fetchSitemap`'s body handler in a byte-counting subscriber so each entry is bounded in both count and size.

---

### F-RD2-07 — DnsController.lookup loops `type` tokens with no dedup or count cap, amplifying outbound DNS

**Severity:** medium
**Category:** user-bounded-loop
**Location:** C:\projects\netscope\api\src\main\java\io\netscope\dns\DnsController.java:62

**Claim:** DnsController.lookup walks `type.toUpperCase().split(",")` with no de-duplication and no element-count cap. Each repeated valid token triggers a sequential `BoundedDns.run` (3 s timeout, 8 s max) plus an optional RRSIG lookup if `includeRrsig=true`. An attacker can submit `?type=A,A,A,...` (thousands of duplicates) to issue thousands of synchronous DNS queries per HTTP request, exhausting the BoundedDns virtual-thread executor and amplifying outbound DNS load against the recursive resolver.

**Bypass path:**
The loop at C:\projects\netscope\api\src\main\java\io\netscope\dns\DnsController.java:62 walks `type.toUpperCase().split(",")` with no de-duplication and no element-count cap. Each valid token (21 accepted: A, AAAA, MX, TXT, CNAME, NS, SOA, CAA, SRV, PTR, TLSA, SVCB, HTTPS, DS, DNSKEY, RRSIG, NSEC, NSEC3, CDS, CDNSKEY) survives the `rt == null` filter and triggers a synchronous `BoundedDns.run` (3s per-query timeout, sequential within the request). When `includeRrsig=true`, every non-RRSIG token also triggers a second `BoundedDns.run` for RRSIG — doubling the amplification. Key verified amplification mechanics: BoundedDns calls `lookup.setCache(null)` (line 97 of BoundedDns.java, deliberate per the comment), so dnsjava's in-process cache does NOT short-circuit duplicates — every iteration walks the resolver path. The handler is a plain synchronous `Map<String,Object>` return, so `spring.mvc.async.request-timeout: 30s` does NOT apply; a single request can hold its worker thread for the full ~3,500 × 3s = ~3 hours wall-clock if every query times out. DomainNormaliser + regex + reserved-TLD check validate only the `domain`, not `type`. There is no per-list bound on `type`. Guards that limit but do not block the abuse: the 30/min anonymous rate limit (RateLimitFilter, `netscope.rate-limit.anonymous-per-minute: 30`) caps requests per IP; Tomcat's default `maxHttpHeaderSize` (~8KB) caps the URL length, so an attacker fits ~3,500 `A,` tokens per request — not "thousands of clients" worth of repeats in one URL, but still a ~3,500-7,000× amplification per HTTP call; each query is bounded per-call (3s default, 8s max). Neither guard prevents (a) a single anonymous request from spawning thousands of sequential BoundedDns calls, (b) the handler thread being held for many minutes/hours, or (c) the outbound DNS amplification (~30 req/min × ~3,500 tokens × 2 with includeRrsig ≈ ~210,000 lookups/min per attacker IP). The "exhaust the virtual-thread executor" wording is technically loose (virtual threads are unbounded) but the underlying defect — user-controlled unbounded loop driving a real network sink — is real and is straightforwardly fixed by `Arrays.stream(parts).map(String::trim).distinct().limit(N)`.

**Recommended fix:**
Replace the raw split with `Arrays.stream(parts).map(String::trim).filter(...).distinct().limit(8)` (or similar small cap) so duplicate / overlong `type` lists cannot amplify a single HTTP request into thousands of resolver queries.

---

### F-RD2-08 — JSON `@RequestBody` payloads bypass Tomcat/multipart size caps, OOM via Jackson defaults

**Severity:** medium
**Category:** unbounded-request-body
**Location:** C:\projects\netscope\api\src\main\resources\application.yml:60

**Claim:** Spring Boot is configured with `server.tomcat.max-http-form-post-size: 128KB` and `spring.servlet.multipart.max-request-size: 1MB`, but neither setting caps the size of `application/json` `@RequestBody` payloads. The 10 endpoints accepting `@RequestBody` (port scan, monitor create, status-page incident with 10 000-char body field, webhook create, etc.) have only field-level `@Size` constraints that Bean Validation only enforces *after* Jackson has already parsed and allocated the full JSON tree. Combined with the lack of any Jackson `StreamReadConstraints` override (defaults: maxStringLength=20 MB, maxNestingDepth=1000, maxNumberLength=1000), a single anonymous POST of a 19 MB JSON string or a 1000-level deeply nested object will be fully buffered and parsed before validation rejects it.

**Bypass path:**
Attack path: anonymous attacker POSTs `{"target":"A...A"}` (19 999 999 chars) to `/api/v1/reach/check` (or `/api/v1/port/check` / `/api/v1/port/scan`) with `Content-Type: application/json`. Walking the chain: (1) Tomcat connector — `max-http-form-post-size: 128KB` and `max-swallow-size: 128KB` in `application.yml:37-38` only apply to `x-www-form-urlencoded` / aborted-upload swallow respectively, NOT to JSON bodies; (2) `spring.servlet.multipart.max-request-size: 1MB` only governs `multipart/form-data` (Spring Boot doctrine — confirmed by grep, no other body-size setting present); (3) `RequestIdFilter`, `RateLimitFilter` (30/min anon, fail-open on Redis errors), `ApiKeyFilter`, `SessionFilter` all read headers only, never touch the body; (4) Spring MVC's `MappingJackson2HttpMessageConverter` then streams the body into Jackson, which has NO `StreamReadConstraints` override anywhere in the repo (verified by grep across `api/src/main` — zero matches for `StreamReadConstraints`, `maxStringLength`, `Jackson2ObjectMapperBuilder`, or any custom `ObjectMapper` bean), so the Spring-Boot-3.5.14 / Jackson 2.18.x defaults apply: `maxStringLength=20 MB`, `maxNestingDepth=1000`; (5) Jackson fully allocates the 19 MB `String` and constructs the `ReachRequest` record; (6) only THEN does Bean Validation run — but `ReachRequest.target` is `@NotBlank` with no `@Size` (line 23 of `ReachController.java`), so even validation does not reject — the controller proceeds to call `validator.resolveAndValidate(req.target())` on the 19 MB string. Same shape for `PortDtos.PortCheckRequest.target` / `PortScanRequest.target` (only `@NotBlank`). For `StatusPageController.IncidentRequest.body` (`@Size(max=10_000)` post-parse) and `MonitorController.MonitorRequest.target` (`@Size(max=253)`), the size cap runs AFTER the 20 MB string has already been allocated, so the DoS still works there too. With virtual threads enabled (`spring.threads.virtual.enabled: true`) request concurrency is unbounded, so 30 parallel anonymous 19 MB uploads per IP per minute (botnet or even single distributed source) trivially produce hundreds of MB of live heap pressure before the rate limiter — which also fails OPEN on Redis errors — can throttle. The 1000-level deep-JSON nesting variant additionally allocates ~1000 record objects per request before validation. The claim accurately identifies a real unbounded-JSON-body vector with no upstream guard.

**Recommended fix:**
Add a `Jackson2ObjectMapperBuilderCustomizer` bean that sets `StreamReadConstraints` (e.g. `maxStringLength=64_000`, `maxNestingDepth=64`, `maxNumberLength=100`) and add a Tomcat `maxPostSize`/connector-level body-size limit on JSON-accepting endpoints, so unbounded bodies are rejected before Jackson allocates them.

---

## Methodology

This review was a **static scan with adversarial verification**, not a penetration test. The pipeline:

1. **Fan-out scan** — six parallel agents each focused on one of the round-2 dimensions (XXE / Jackson deserialisation, open redirect, timing attacks, logging-PII / credential leakage, HTTP response splitting / header injection, resource exhaustion / DoS) read every @RestController and supporting service under `api/src/main/java/io/netscope/` and emitted raw candidate findings.
2. **Adversarial verify** — each raw finding was independently re-evaluated against the full upstream call chain (filters, normalisers, validators, guards) to confirm the bypass path actually reaches the sink, rejecting any claim where an existing guard already blocks the attack.
3. **Triage** — surviving findings were graded for severity based on the realistic impact in the codebase's deployment context (e.g., what the attacker actually learns or controls), not the worst theoretical case.

**Out of scope / next-review gaps:**

- **Runtime DoS** — slow-loris, decompression-bomb, regex catastrophic backtracking on tagged payloads. Static reasoning cannot prove the absence of these without instrumented load.
- **Timing side-channels** — HMAC comparison, cache-hit/miss latency, DNS-lookup timing oracles. These need wall-clock measurement.
- **Exotic encoding attacks** — Unicode normalization corner cases, IDN homograph collisions beyond what HostnameNormaliser catches, double-decoding paths through proxies, content-type confusion. Best discovered with a fuzzer.
- **Dependency / supply-chain risk** — CVEs in transitive Maven/npm dependencies, lockfile drift, unpinned base images. Outside the per-controller scope of this pass.
- **Authn/z workflow holes** — IDOR via predictable IDs, race conditions on multi-step flows, session-fixation. These need a stateful tester, not a code reader.

Recommend the next review add a **dynamic-payload dimension** (auto-generated fuzzer requests against a running instance) so we push beyond what static reasoning can prove.
