# Security Review — 2026 Q2

**Reviewer:** workflow-driven adversarial scan (4 dimensions × parallel agents)
**Date:** 2026-05-30
**Scope:** every @RestController under api/src/main/java/io/netscope/

## Summary

- Dimensions scanned: input-validation, SSRF, error-disclosure, auth-rate-limit
- Raw findings (pre-verification): 19
- After adversarial verify: 6 confirmed real, 6 false-positives

## Confirmed findings

### F-01 — DNS-rebinding TOCTOU in SslGradeController leaks internal TLS cert metadata

**Severity:** high
**Category:** SSRF
**Location:** api/src/main/java/io/netscope/sslgrade/SslGradeController.java:53

**Claim:** DNS-rebinding TOCTOU: validator.resolveAndValidate(host) at line 41 resolves once, but new InetSocketAddress(host, port) at line 53 performs a SECOND DNS lookup at connect time, opening a rebind window where the attacker resolver returns a public IP for validation and 127.0.0.1 (or 169.254.169.254) for the actual TLS handshake.

**Bypass path:**
REAL exploitable DNS-rebinding TOCTOU SSRF. At SslGradeController.java:41, validator.resolveAndValidate(host) resolves all A records and rejects blocked ranges, but its returned InetAddress is DISCARDED. The raw `host` String is then passed to new InetSocketAddress(host, port) at line 53, which performs an independent SECOND DNS lookup at construction time. With a low-TTL attacker-controlled authoritative resolver (TTL=0, round-robin or split-response), the first lookup returns a public IP that passes BlockedAddressRules, and the second lookup ms later returns 169.254.169.254 / 127.0.0.1 / a private RFC1918 host. The SSLSocket then connects to the internal target, completes a TLS handshake with SNI = the original attacker hostname, and the controller reflects sess.getPeerCertificates()[0] back to the caller as `subject`, `issuer`, `protocol`, `cipher`, `keyAlgorithm`, etc. — leaking the internal service's certificate chain and metadata. No upstream guard blocks this: HostnameNormaliser only canonicalises strings without pinning DNS; ApiKeyFilter/RateLimitFilter don't touch resolution; ResponseCache key is `host:port` which is attacker-chosen, so the first request fully reaches the sink. The sibling SslController.inspect (api/src/main/java/io/netscope/ssl/SslController.java:54-77) implements the correct pattern — captures `addr = validator.resolveAndValidate(host)` and passes `new InetSocketAddress(addr, port)` — and its inline comment explicitly documents this exact attack ("a low-TTL attacker resolver could return a public IP first (passes validate) and 127.0.0.1 second"). The author fixed it in one controller and missed the other.

**Recommended fix:**
Change line 41 to `InetAddress addr = validator.resolveAndValidate(host);`, propagate `addr` into the compute path, and construct `new InetSocketAddress(addr, port)` at line 53 — mirroring SslController.inspect's pattern so the validated address is the one actually connected to.

---

### F-02 — /api/v1/ip/{ip}/sources bypasses the reserved-address block enforced on /lookup

**Severity:** medium
**Category:** missing-auth
**Location:** api/src/main/java/io/netscope/ip/IpController.java:41

**Claim:** Reserved/private-IP block bypass: /api/v1/ip/{ip} (lookup) routes through IpAddressGuard.parseAndGuard which rejects loopback/RFC1918/cloud-metadata, but /api/v1/ip/{ip}/sources (this method) passes ip straight to IpMultiSourceService.lookup whose only validation is the syntactic regex ^[0-9a-fA-F:.]{2,45}$ — no isBlocked() call. An authenticated caller can query GeoIP/reputation data for 127.0.0.1, 10.0.0.1, 169.254.169.254 etc. through the public sources endpoint that the single-source endpoint explicitly refuses.

**Bypass path:**
Real policy-bypass — confirmed by reading the code. Bypass path: An attacker sends GET /api/v1/ip/127.0.0.1/sources (or /169.254.169.254/sources, /10.0.0.1/sources). The endpoint at api/src/main/java/io/netscope/ip/IpController.java:41 is public (not under ApiKeyFilter's PRIVATE_PREFIXES Set.of("/api/v1/monitor","/api/v1/bulk","/api/v1/private")) and routes straight into IpMultiSourceService.lookup at api/src/main/java/io/netscope/ip/IpMultiSourceService.java:86. The only validator in that path is isValidIp() (line 155), which is a syntactic regex `^[0-9a-fA-F:.]{2,45}$` — it never invokes IpAddressGuard.parseAndGuard, BlockedAddressRules.isBlocked, or TargetValidator.resolveAndValidate. The sibling endpoint /api/v1/ip/{ip} (IpController.java:30 → IpService.lookup at IpService.java:55-56) explicitly calls IpAddressGuard.parseAndGuard, which throws ApiException.forbidden("address is reserved or internal") for loopback/RFC1918/cloud-metadata addresses. The /sources path inherits none of those guards, so the literal flows through to IpSourceRegistry's fetchers (IpInfoFetcher, IpApiCoFetcher, IpWhoIsFetcher, DbIpFetcher) which embed it in outbound URLs like https://ipinfo.io/127.0.0.1/json. IpAddressGuard's own javadoc calls itself "Authoritative server-side gate that decides whether an IP literal is something the public IP-lookup tool should ever look up" — that policy is documented for the IP-lookup tool as a whole but only enforced on one of the two IP endpoints. Caveat on severity: because the IP literal goes in the URL PATH to external geo providers (not as a host the server connects to), this is not classic SSRF — it cannot probe the internal network or read 169.254.169.254 IMDS credentials. Impact is limited to (a) inconsistent policy enforcement vs. the explicit block on /lookup, (b) using the server as an outbound proxy querying external providers for reserved-address literals. The "missing-auth" label is misleading (it's missing-validation/policy-bypass), and "medium" overstates the practical harm, but the underlying technical claim is accurate and not blocked by any upstream filter.

**Recommended fix:**
Call `IpAddressGuard.parseAndGuard(ip)` at the top of IpMultiSourceService.lookup (or at the IpController.java:41 entry point) so the /sources endpoint enforces the same reserved/private-IP block policy as /lookup.

---

### F-03 — DnsController regex permits consecutive dots, missing guard sibling controllers have

**Severity:** low
**Category:** other
**Location:** api/src/main/java/io/netscope/dns/DnsController.java:52

**Claim:** Domain regex ^[a-zA-Z0-9._-]{1,253}$ permits consecutive dots ('evil..com'). The sibling DohController.probeInternal (DohController.java line 61) shows the correct guard with a negative lookahead (?!.*\.\.) but DnsController, DnssecController, WhoisController, Ipv6Controller, DkimController, EmailAuthController, SubdomainController, and CtLogsController all omit it.

**Bypass path:**
Bypass path confirmed: GET /api/v1/dns/evil..com → ApiKeyFilter allows (DNS endpoint not in PRIVATE_PREFIXES) → RateLimitFilter allows within budget → DomainNormaliser.toAscii("evil..com") short-circuits because isPureAscii() is true and returns the string unchanged (no normalization-time validation) → DnsController line 52 regex ^[a-zA-Z0-9._-]{1,253}$ matches "evil..com" (both dots are in the character class, length 9 ≤ 253) → rejectReservedTld passes (TLD = "com") → BoundedDns.run is invoked per type. The sibling DohController.probeInternal at DohController.java line 61 uses ^(?!.*\.\.)[a-zA-Z0-9._-]{1,253}$ explicitly to reject this exact pattern; HostnameNormaliser uses a label-structured pattern that forbids empty labels; both guards are bypassed because DnsController does its own ASCII regex and never calls TargetValidator/HostnameNormaliser. Impact is correctly characterized as low (dnsjava's Lookup constructor throws TextParseException at parse time so the actual sink is a parse exception per type rather than a network roundtrip, virtual threads are cheap, and the RateLimitFilter still throttles per IP) and the finding is a low-severity hardening-consistency gap, not an exploitable DoS. The claim's narrow assertion — "regex permits consecutive dots, sibling guards it, this one doesn't, same belongs here" — is factually accurate with no upstream guard blocking it.

**Recommended fix:**
Adopt the DohController pattern `^(?!.*\.\.)[a-zA-Z0-9._-]{1,253}$` across DnsController, DnssecController, WhoisController, Ipv6Controller, DkimController, EmailAuthController, SubdomainController, CtLogsController — or better, route all of them through HostnameNormaliser for a single source of truth.

---

### F-04 — WebSocketController DNS-rebinding TOCTOU exposes internal WS service fingerprints

**Severity:** high
**Category:** SSRF
**Location:** api/src/main/java/io/netscope/websocket/WebSocketController.java:109

**Claim:** Same TOCTOU / DNS-rebinding window as SslGradeController. parseAndValidate() (line 166) calls validator.resolveAndValidate(host) but then buildAsync(uri, listener) on line 109 hands the original URI string back to java.net.http.WebSocket, which re-resolves the host at connect time. The validated InetAddress is discarded and never used.

**Bypass path:**
REAL TOCTOU / DNS-rebinding bypass. In WebSocketController.parseAndValidate() (line 182), validator.resolveAndValidate(host) is invoked for its side-effect — the returned InetAddress is discarded (no assignment, no use). The URI object built from the user-supplied string still contains the hostname (not a resolved IP) and is passed unchanged to builder.buildAsync(uri, listener) at line 109. java.net.http.WebSocket performs its own fresh DNS resolution at connect time, so any address change between the check and the connect bypasses the guard. Bypass path: attacker registers rebind.attacker.example with low-TTL/round-robin records alternating between a public IP (e.g., 8.8.8.8) and an internal address (e.g., 127.0.0.1 or 169.254.169.254); attacker sends GET /api/v1/websocket?url=wss://rebind.attacker.example/ (endpoint is NOT in ApiKeyFilter.PRIVATE_PREFIXES, so unauthenticated access is permitted, only rate-limited). The first resolution inside TargetValidator.getAllByName() returns the public IP, isBlocked() passes, parseAndValidate returns the URI. JDK's WebSocket client then re-resolves the hostname and connects to the internal IP, performs the HTTP Upgrade handshake, and the controller returns handshakeLatencyMs, subprotocol (ws.getSubprotocol()), closeStatusCode, closeReason, and pingRttMs to the caller — exactly the fingerprinting oracle described. No upstream guard (TargetValidator, HostnameNormaliser, ApiKeyFilter, RateLimitFilter) mitigates this because the validated InetAddress is never propagated to the connect call. Fix would be to pin the connection to the validated InetAddress (e.g., by constructing the URI with the literal IP and supplying the hostname as SNI / Host header), but the current code does not do that.

**Recommended fix:**
Capture the InetAddress returned by validator.resolveAndValidate(host), construct the WebSocket URI with the literal IP, and pass the original hostname via the Host/SNI header so the JDK client cannot re-resolve to a different address.

---

### F-05 — WebhookDeliveryWorker DNS-rebinding TOCTOU posts signed payloads to internal hosts

**Severity:** high
**Category:** SSRF
**Location:** api/src/main/java/io/netscope/webhook/WebhookDeliveryWorker.java:138

**Claim:** isSsrfSafeUrl(wh.getUrl()) on line 110 resolves+validates the URL host once, then HttpRequest.newBuilder(URI.create(wh.getUrl())) on line 128 + http().send(...) on line 138 cause the JDK HttpClient to re-resolve the host independently. The validated InetAddress is never carried forward, so a webhook URL whose hostname returns a public IP at validation and a private IP a few hundred ms later (low-TTL rebind) will POST the signed webhook body — which includes potentially sensitive event payload data and the HMAC signature — to an internal endpoint.

**Bypass path:**
Real DNS rebinding TOCTOU. On line 110, `isSsrfSafeUrl(wh.getUrl())` calls `TargetValidator.resolveAndValidate(host)` (line 170), which performs DNS lookup #1 via `InetAddress.getAllByName()` and validates the results against the blocked-address rules. The returned `InetAddress` is discarded — the validator's return value is not used. On lines 128/138, `HttpRequest.newBuilder(URI.create(wh.getUrl()))` + `http().send(...)` causes the JDK HttpClient to perform its own independent DNS lookup #2 of the hostname, with no custom DnsResolver attached (verified: HttpClient.newBuilder() at line 64 sets only connectTimeout + followRedirects, no host pinning). Bypass path: attacker registers `rebind.attacker.example` with low TTL, creates a webhook with that URL. First lookup at validation time returns a public IP (passes `BlockedAddressRules.isBlocked`). A few hundred ms later when `http().send()` runs, the JDK re-resolves and gets 169.254.169.254 (or 127.0.0.1, or an RFC1918 address); the POST with body, X-NetScope-Signature (HMAC), and X-NetScope-Event headers reaches the internal target. `followRedirects(NEVER)` blocks 30x-based bypasses but does nothing against DNS rebinding. The code comment on lines 107-109 explicitly acknowledges the TOCTOU concern but the implementation does not actually close the window — it re-validates with a fresh DNS lookup instead of pinning the validated address (e.g., by passing the resolved IP into the URI and putting the original hostname in a Host header, or by using a custom InetAddressResolver on the HttpClient).

**Recommended fix:**
Pin the validated InetAddress by either rewriting the URI with the resolved IP and setting the Host header to the original hostname, or attaching a custom InetAddressResolver to HttpClient that returns only the pre-validated address — closing the TOCTOU window the existing comment already acknowledges.

---

### F-06 — WhoisController follows redirects with no per-hop SSRF validation, bypassing SafeHttpClient

**Severity:** medium
**Category:** SSRF
**Location:** api/src/main/java/io/netscope/whois/WhoisController.java:65

**Claim:** RestClient is built with HttpClient.Redirect.NORMAL on line 42 and the {domain} URI variable is bound to a fixed https://rdap.org/domain/{d} host, but rdap.org's entire purpose is to issue 30x redirects to per-TLD RDAP servers (e.g. rdap.verisign.com, rdap.denic.de) — none of which are validated, and the redirect target is followed automatically by the JDK HttpClient with zero per-hop SSRF check. Any compromised / misconfigured / open-redirect-vulnerable TLD RDAP server can redirect the request to 169.254.169.254/latest/meta-data, 127.0.0.1, or any RFC1918 address and the response body is parsed as RDAP JSON and surfaced in the 'raw' field of the API response.

**Bypass path:**
REAL but with the caveat that the specific IMDS reproduction in the claim is wrong. WhoisController at api/src/main/java/io/netscope/whois/WhoisController.java:41-44 builds its own HttpClient with HttpClient.Redirect.NORMAL and does NOT route through the codebase's existing SafeHttpClient (api/src/main/java/io/netscope/common/http/SafeHttpClient.java) which already implements MAX_REDIRECTS=5 with per-hop TargetValidator.resolveAndValidate(host) — exactly the guard needed here. TargetValidator and HostnameNormaliser are never invoked by WhoisController; the only input check is a permissive regex on the path variable. So there is no per-redirect-hop SSRF check, and the bypass path is: attacker controls a TLD RDAP server (or finds an open-redirect/SSRF in one) → rdap.org redirects there → that server replies 302 Location: https://<internal-target>/ → JDK HttpClient follows it → mapper.readTree(body) at line 75 parses the response → out.put("raw", redactRegistrantPii(j)) at line 93 surfaces the JSON body to the unauthenticated caller. Caveat: the claim's exact reproduction (302 to http://169.254.169.254/...) is actually BLOCKED by Redirect.NORMAL, which refuses HTTPS→HTTP downgrades, and AWS IMDS is HTTP-only. So real-world exploitation is narrower than the claim asserts — limited to HTTPS targets with valid certs returning JSON (some internal admin UIs, internal HTTPS services with corp-CA certs, or DNS rebinding scenarios). The structural SSRF (missing per-hop validation when SafeHttpClient exists in-repo and is the project's documented pattern for this exact concern) is genuine and should be fixed by routing this call through SafeHttpClient.

**Recommended fix:**
Route the WhoisController RDAP call through SafeHttpClient (which already enforces MAX_REDIRECTS=5 with per-hop TargetValidator.resolveAndValidate) instead of constructing a bare HttpClient with Redirect.NORMAL.

---

## Methodology

This review was a **static scan with adversarial verification**, not a penetration test. The pipeline:

1. **Fan-out scan** — four parallel agents each focused on one dimension (input-validation, SSRF, error-disclosure, auth-rate-limit) read every @RestController under `api/src/main/java/io/netscope/` and emitted raw candidate findings.
2. **Adversarial verify** — each raw finding was independently re-evaluated against the full upstream call chain (filters, normalisers, validators, guards) to confirm the bypass path actually reaches the sink, rejecting any claim where an existing guard already blocks the attack.
3. **Triage** — surviving findings were graded for severity based on the realistic impact in the codebase's deployment context (e.g., what the attacker actually learns or controls), not the worst theoretical case.

**Out of scope / next-review gaps:**

- **Runtime DoS** — slow-loris, decompression-bomb, regex catastrophic backtracking on tagged payloads. Static reasoning cannot prove the absence of these without instrumented load.
- **Timing side-channels** — HMAC comparison, cache-hit/miss latency, DNS-lookup timing oracles. These need wall-clock measurement.
- **Exotic encoding attacks** — Unicode normalization corner cases, IDN homograph collisions beyond what HostnameNormaliser catches, double-decoding paths through proxies, content-type confusion. Best discovered with a fuzzer.
- **Dependency / supply-chain risk** — CVEs in transitive Maven/npm dependencies, lockfile drift, unpinned base images. Outside the per-controller scope of this pass.
- **Authn/z workflow holes** — IDOR via predictable IDs, race conditions on multi-step flows, session-fixation. These need a stateful tester, not a code reader.

Recommend the next review add a **dynamic-payload dimension** (auto-generated fuzzer requests against a running instance) so we push beyond what static reasoning can prove.
