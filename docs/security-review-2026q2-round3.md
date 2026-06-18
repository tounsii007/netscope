# Security Review — 2026 Q2, Round 3

**Reviewer:** workflow-driven adversarial scan, round 3 (auth / financial / config angles)
**Date:** 2026-05-30
**Scope:** every @RestController + auth + billing + outbound HTTP client under api/src/main/java/io/netscope/

## Round-3 vs Rounds 1 + 2

Round 1 (docs/security-review-2026q2.md): input-validation, SSRF, error-disclosure, auth-rate-limit → 6 confirmed (all fixed).
Round 2 (docs/security-review-2026q2-round2.md): XXE / Jackson deserialisation, open redirect, timing attacks, logging-PII, header injection, resource exhaustion.
Round 3 (this report) expands to:

- JWT verification completeness (alg=none, kid spoofing, missing iss/aud/nbf)
- OAuth state / nonce / PKCE
- CSRF on session-authenticated mutating routes
- Mass assignment / DTO over-posting
- TLS outbound — disabled cert/hostname verification
- Stripe webhook replay / reuse / idempotency

## Summary

- Dimensions scanned: 6
- Raw findings: 25
- After dedup: 25
- Adversarially verified: 15
- Confirmed real: 6
- False positives: 9

## Confirmed findings

### F-RD3-01 — OIDC audience check silently disabled when google.client-id is blank (default)

**Severity:** high
**Category:** missing-aud-check
**Location:** api/src/main/java/io/netscope/user/OidcIdTokenVerifier.java:134

**Claim:** When `netscope.oauth.google.client-id` is blank (the default in dev/test, and silently the default in any deploy that forgets to set it), `OidcIdTokenVerifier` passes `null` as the audience to `DefaultJWTClaimsVerifier`. The nimbus-jose-jwt 10.0.2 bytecode confirms `verify()` short-circuits when `acceptedAudienceValues == null` (`ifnull` jump at offset 4) and skips the aud check entirely. The comment on lines 130-132 claims the audience check happens in the controller after extraction, but `AuthController.fetchGoogleFromIdToken` and downstream code never call `getAudience()` / check `aud` anywhere. Net effect: any Google-signed id_token from any other Google OAuth client (e.g., one the attacker registered) passes verification, and its `sub`+`email` are used to log into a netscope account — the canonical OIDC client-mixup attack. The `JWTClaimsSet.Builder().issuer(googleIssuer).build()` passed as `exactMatchClaims` only pins the issuer, so it does not save the audience.

**Bypass path:**
CONFIRMED REAL — classic OIDC client-mixup vulnerability. Attack path verified end-to-end:

(1) Default-blank config: `OidcIdTokenVerifier.java:57` declares `@Value("${netscope.oauth.google.client-id:}")` with empty-string default. `netscope.oauth.google.client-id` is NOT set in `api/src/main/resources/application.yml` and there is no startup-time validation rejecting blank values (the property is only referenced in `OidcIdTokenVerifier.java`). So absent an explicit env-var override, `googleClientId` is `""`.

(2) Null-audience hand-off: `OidcIdTokenVerifier.java:134` passes `googleClientId.isBlank() ? null : googleClientId` to `DefaultJWTClaimsVerifier`. With a blank prop this passes `null`.

(3) Library short-circuit verified at the bytecode level (nimbus-jose-jwt 10.0.2, confirmed as the active dep in `api/pom.xml:125-127`). Disassembling `com/nimbusds/jwt/proc/DefaultJWTClaimsVerifier.class` from the maven cache shows the `verify()` method begins:
```
0: aload_0; 1: getfield #63 acceptedAudienceValues; 4: ifnull 139
```
So when the field is null, control jumps to offset 139, completely skipping the audience-validation block (offsets 7-138). The constructor body further confirms that when `acceptedAudienceValues` arg is null, "aud" is NOT added to `requiredClaims` either (offsets 69-98) — so neither presence nor value of `aud` is checked.

(4) `requiredClaims = Set.of("sub","iss","iat","exp")` at OidcIdTokenVerifier.java:136 does not contain "aud", so even the required-claims pass doesn't catch a missing/wrong audience.

(5) `exactMatchClaims = new JWTClaimsSet.Builder().issuer(googleIssuer).build()` (line 135) only pins `iss` — does not constrain `aud`.

(6) `AuthController.fetchGoogleFromIdToken` (AuthController.java:173-193) extracts `sub`/`email`/`name`/`picture`/`email_verified` directly from claims and returns them. A repo-wide grep for `getAudience|"aud"|audience|azp|verifyAud` finds NO usage outside `OidcIdTokenVerifier.java` (and the only refs there are the misleading javadoc claiming the controller does it). The comment on lines 130-132 that says "The audience check happens in the controller after extraction" is a documented lie — no such check exists anywhere.

(7) `AuthController.exchange` (lines 88-100) then calls `users.findByOauthProviderAndOauthSubject("google", oauth.subject())`. Google's `sub` is the user's stable Google account ID, identical across any OAuth client used to sign them in. So an id_token an attacker harvests via their own `attacker.apps.googleusercontent.com` client will resolve to the legitimate victim's netscope `User` record, and the controller issues `jwt.issue(user.getId(), user.getEmail(), ...)` — full account takeover.

Caveats considered and dismissed: (a) the `id_token must be a verified Google signature` does not help — an attacker's own Google OAuth client gets Google to sign id_tokens for any user who completes their phishing flow; (b) the `iss` pin to `accounts.google.com` is satisfied because Google issues that for every client; (c) `email_verified` is just read into the OauthUser, not gated on; (d) no nonce check (verify() in OidcIdTokenVerifier doesn't accept a nonce arg at all); (e) no `azp` check that would otherwise distinguish the original audience.

Severity high is correct: this is unauthenticated full account takeover of any existing Google-OAuth netscope user, given a single phished id_token, with the default config.

**Recommended fix:**
Refuse to boot with blank `google.client-id` outside dev/test profiles (mirror how `JwtService` already refuses to boot with the placeholder JWT secret). Pass `googleClientId` (or a Set including it) to `DefaultJWTClaimsVerifier` so the library check fires. Defensively also call `claims.getAudience().contains(googleClientId)` in `fetchGoogleFromIdToken` before trusting any claims.

---

### F-RD3-02 — JwtService.parse omits sub-presence check (filter throws 500 on null sub)

**Severity:** high
**Category:** missing-sub-check
**Location:** api/src/main/java/io/netscope/user/JwtService.java:199

**Claim:** `JwtService.parse()` validates signature, alg, exp, nbf, and iss — but never asserts that `sub` is present and non-blank. If anyone produces an HS256-signed token with the configured issuer but a missing/null/empty `sub` (e.g., a sibling service that shares the secret, a leaked secret, a future caller that uses `JwtService.issue` with an extras map that overrides sub to null, or a forged token after secret compromise), `parse()` happily returns a Map whose `sub` value is null. `SessionFilter.java:37` then calls `UUID.fromString(String.valueOf(claims.get("sub")))` → `UUID.fromString("null")` → IllegalArgumentException leaks out of the filter as a 500. Worse, the absence of a `sub` requirement means defence-in-depth on the local JWT path is one layer thinner than the OIDC path (which DOES require sub via the `Set.of("sub", "iss", "iat", "exp")` required-claims set on line 136).

**Bypass path:**
Verified the three technical claims:

1. **JwtService.parse() (api/src/main/java/io/netscope/user/JwtService.java:190-222) does NOT validate sub.** Lines 197 (signature), 196 (alg=HS256 allow-list), 202-203 (exp+skew), 205-206 (nbf+skew), 208 (iss equality) are the only assertions. There is no `claims.getSubject() == null || isBlank()` check, and no nimbus `DefaultJWTClaimsVerifier` configured with a required-claims set. The Map at line 214 is returned as-is, so `out.get("sub")` will be `null` if the forged token omits sub.

2. **SessionFilter.java:37 does UUID.fromString unguarded.** `UUID.fromString(String.valueOf(claims.get("sub")))` — when `claims.get("sub")` returns null, `String.valueOf(null)` returns the literal string `"null"`, and `UUID.fromString("null")` throws `IllegalArgumentException`. There is no try/catch around it; the filter's `try { ... } finally { SessionContext.clear(); }` (lines 32-45) only ensures cleanup, it does not swallow the exception.

3. **OIDC path is stricter — asymmetry confirmed.** OidcIdTokenVerifier.java:133-136 wires a `DefaultJWTClaimsVerifier` with `Set.of("sub","iss","iat","exp")` as required claims. The local HS256 path is genuinely thinner.

4. **Exception handling cannot rescue this.** GlobalExceptionHandler (`@RestControllerAdvice`) only catches exceptions raised inside controller dispatch — it does NOT intercept exceptions thrown from a servlet filter before the dispatcher servlet runs. The IllegalArgumentException escapes the filter chain, the servlet container forwards to Spring Boot's `/error` path, and the response is a generic 500 (BasicErrorController) rather than the intended 401 from downstream auth.

Attack-path realism: full exploitation requires HS256 secret compromise (leaked secret, sibling service sharing it, or a future `extras` map regression that nulls sub). With the secret compromised, an attacker can already issue arbitrary tokens with valid sub UUIDs, so the missing-sub-check doesn't grant new privilege escalation. However, the defensive gap is real:
- Inconsistent enforcement vs. the OIDC path (which is stricter without good reason).
- Filter throws IllegalArgumentException → 500 instead of a clean 401, which is an observable distinction (information leak about token validity).
- A future caller could legitimately invoke `issue(userId, email, Map.of("sub", null))` because the extras merge at lines 159-163 happens AFTER the canonical subject and overrides it — turning this into a self-inflicted regression vector.

**Recommended fix:**
Add `if (claims.getSubject() == null || claims.getSubject().isBlank()) return null;` in `JwtService.parse` (or wire a `DefaultJWTClaimsVerifier` with `Set.of("sub","iss","exp")` as required claims). In `SessionFilter`, wrap the `UUID.fromString` call in a try/catch that falls through to anonymous so a malformed sub yields 401, not 500. Optionally reject extras keys that collide with reserved claim names (`sub`, `iss`, `exp`, `iat`, `nbf`) in `JwtService.issue` to close the self-inflicted regression vector.

---

### F-RD3-03 — /exchange has no state / PKCE / session-binding (bearer-token replay)

**Severity:** high
**Category:** state-csrf
**Location:** api/src/main/java/io/netscope/user/AuthController.java:71

**Claim:** No state-parameter validation at the API boundary. `/exchange` accepts an opaque `{provider, accessToken, idToken?}` POST with no binding to an originating sign-in request — the backend has no `/authorize` and no callback, and the class doc (lines 20-25) explicitly delegates the OAuth dance to NextAuth on the frontend. There is no cookie, no PKCE-derived secret, no session-binding nonce checked here, so a captured access_token from any source (browser devtools, referrer leak, SDK log, malicious extension) can be POSTed directly to `/exchange` to mint a netscope JWT. The cross-tab CSRF defence is therefore entirely a front-end concern; the API itself does not enforce it.

**Bypass path:**
Verified at api/src/main/java/io/netscope/user/AuthController.java:69-119 and the dependent OidcIdTokenVerifier.java + SecurityConfig.java. The finding's factual claims are all accurate:

1. There is no backend `/authorize` or callback endpoint — only `/exchange` exists. The class-level doc (lines 20-25) explicitly delegates the OAuth dance to NextAuth on the frontend.
2. `ExchangeRequest` (lines 43-47) accepts `{provider, accessToken, idToken?}` with NO state/nonce/PKCE/cookie/originating-request binding parameter.
3. `OidcIdTokenVerifier`'s own JavaDoc (lines 31-34) confirms `nonce` validation is opt-in and the backend doesn't supply an expected value — so the nonce in the id_token is never compared against anything the backend issued.
4. SecurityConfig.java explicitly `.csrf(...)` disables CSRF for `/api/v1/auth/**` (line 51) and `.permitAll()` on the path (line 63), so there is no CSRF token check at the filter chain either.
5. The access_token path (`fetchGithub`, `fetchGoogle` at lines 123-164) does a pure bearer-token round-trip to userinfo — no audience pinning, no proof-of-possession.
6. The id_token path's audience check is also conditionally skipped when `googleClientId` is blank (line 134 — `googleClientId.isBlank() ? null : googleClientId`), which the verifier itself documents at line 130-132 as "the audience check happens in the controller after extraction" — but `fetchGoogleFromIdToken` at lines 173-193 also never validates `aud` against any expected client_id; it only reads `sub`, `email`, `name`, `picture`, `email_verified`.

Attack path: an attacker who obtains a Google access_token (or id_token, in dev/test where client_id is unset) for victim V — via XSS on a sibling app, malicious browser extension, referer leak, an SDK log, or a captured server-side log — can POST it raw to `/api/v1/auth/exchange`. The backend will validate the bearer with Google's userinfo (access_token) or verify the JWS signature (id_token), extract `sub`/`email`, find-or-create the user, and `jwt.issue(user.getId(), ...)` returns a netscope-issued JWT bound to V's user-id. The only rate-limit is the auth tier in RateLimitFilter; no other guard blocks this.

The category label "state-csrf" is slightly loose — this is more precisely a bearer-token / confused-deputy / lack-of-proof-of-possession issue than classical session-riding CSRF — but the underlying claim ("no state-parameter validation at the API boundary, no binding to an originating sign-in request") is technically correct.

**Recommended fix:**
Add a backend-initiated sign-in start step that issues a signed, single-use one-shot ticket (HMAC) bound to a freshly-minted nonce and (optionally) to the requesting IP/user-agent. Require the ticket on `/exchange` and verify it once before validating the access_token/id_token. Reject ticket reuse via a short-lived Redis/in-memory set keyed on ticket-id. Bind the ticket to the netscope JWT mint at exchange-time so a leaked access_token cannot be replayed without the corresponding ticket.

---

### F-RD3-04 — id_token nonce never bound, enabling replay until exp

**Severity:** high
**Category:** nonce-binding
**Location:** api/src/main/java/io/netscope/user/OidcIdTokenVerifier.java:136

**Claim:** Nonce claim is never bound. The required-claims set on line 136 is `Set.of("sub","iss","iat","exp")` — no nonce. The class JavaDoc (lines 30-34) is candid: "nonce is checked when the caller supplies an expected value; it's optional". But `AuthController.fetchGoogleFromIdToken` (line 175) calls `oidc.verify("google", idToken)` with no expected-nonce. The result: a captured id_token (e.g. exfiltrated from a different user's logged browser history, intercepted by a malicious browser extension, or pulled from a leaked HTTP-Referer / SDK log) can be replayed at `/exchange` and accepted as proof of identity until exp. There is no way the verifier can detect that this id_token was not minted for THIS sign-in attempt.

**Bypass path:**
REAL. The id_token path in `AuthController.fetchGoogleFromIdToken` (api/src/main/java/io/netscope/user/AuthController.java:173-193) calls `oidc.verify("google", idToken)` with no expected nonce. The verifier's required-claims set at OidcIdTokenVerifier.java:136 is `Set.of("sub","iss","iat","exp")` — nonce is absent — and the `verify` signature accepts only `(provider, idToken)`. There is no replay-tracking elsewhere (no jti cache, no token-consumed-once map — grep for nonce/jti/replay/usedTokens turns up nothing in api/src/main/java besides the JavaDoc admission on OidcIdTokenVerifier.java:31-34). The exchange endpoint is `permitAll`, CSRF is disabled for `/api/v1/auth/**` (SecurityConfig.java:48-52), and no cookie/session binding correlates the token to the caller.

Attack path: capture any non-expired Google id_token minted for the netscope client_id (extension exfiltration, leaked logs, breach, debugging dump) → direct POST to `/api/v1/auth/exchange` with `{"provider":"google","accessToken":"<any-non-blank>","idToken":"<captured>"}` — the `accessToken` is `@NotBlank` but ignored on the id_token branch (line 78-79) — → signature/iss/aud/exp/iat all validate → `fetchGoogleFromIdToken` extracts `sub`+`email`, find-or-create user, NetScope JWT issued. Account takeover for the id_token's exp lifetime (typically 1 hour). CORS does not block this — CORS is browser-enforced and the attack is a direct curl.

**Recommended fix:**
Require the frontend to forward the nonce it generated, store the nonce server-side bound to the sign-in start (Redis/short-TTL cache keyed on the one-shot ticket from F-RD3-03), and compare in `OidcIdTokenVerifier#verify(provider, idToken, expectedNonce)`. Add `nonce` to the required-claims set on line 136 once the expected value is plumbed through. Belt-and-braces: cache `jti` values for the id_token's remaining lifetime and reject reuse.

---

### F-RD3-05 — Audience confusion: any Google OAuth app's id_token accepted when client-id unset

**Severity:** critical
**Category:** aud-bypass
**Location:** api/src/main/java/io/netscope/user/OidcIdTokenVerifier.java:134

**Claim:** Audience (aud) check is silently disabled when the configured client-id is empty: `googleClientId.isBlank() ? null : googleClientId`. The comment on lines 130-132 says "we don't pin aud here because the configured client_id may be empty in dev/test profiles" and defers the check "in the controller after extraction" — but `AuthController.fetchGoogleFromIdToken` (lines 174-186) NEVER checks aud either. So a deploy that forgets to set `netscope.oauth.google.client-id` (env var typo, missing secret in K8s, fresh profile) will accept ANY valid Google-issued id_token from ANY Google OAuth application — a classic "Google sign-in audience confusion" issue. An attacker with their own Google OAuth app gets id_tokens from real users (e.g. a quiz app, a coffee-shop wifi portal) and replays them at `/exchange`.

**Bypass path:**
Confirmed account-takeover via Google id_token cross-OAuth-app audience confusion when `netscope.oauth.google.client-id` is unset (which is its default — the property does not appear in application.yml and has a `:` default in the `@Value` annotation).

Attack path traced end-to-end:
1. `OidcIdTokenVerifier.java:57` — `@Value("${netscope.oauth.google.client-id:}")` defaults to empty string. No `application.yml` entry exists; only an env var would populate it.
2. `OidcIdTokenVerifier.java:134` — `googleClientId.isBlank() ? null : googleClientId` passes `null` as the required-audience to `com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier`. With `null`, Nimbus skips aud verification entirely (per Nimbus contract; `null` = "do not check this claim").
3. The verifier comment (lines 130-132) promises the audience check is deferred to the controller, but `AuthController.fetchGoogleFromIdToken` (lines 173-193) only reads `sub/email/name/picture/email_verified` — it never calls `claims.getAudience()` and never compares it to anything. Grep across the whole repo confirms only one usage of `googleClientId` (the line 134 sink itself) and zero uses of `getAudience`.
4. No `@PostConstruct`, `@ConditionalOnProperty`, or profile-aware startup guard refuses to boot when client-id is missing — the app silently runs with audience verification disabled.
5. Issuer + signature are still verified, so the token must be a real Google-issued OIDC id_token — but that includes id_tokens from ANY Google OAuth application owned by anyone (issuer is `https://accounts.google.com` for all of them).
6. Exploitation: attacker registers a free Google OAuth Web Application, gets a victim to sign in (e.g. a quiz/wifi-portal app), captures the real Google id_token from their own callback, then POSTs `{"provider":"google","idToken":"<victim-token>"}` to `/api/v1/auth/exchange`. `oidc.verify` accepts the token; `fetchGoogleFromIdToken` extracts the victim's `sub` + `email`; the `users.findByOauthProviderAndOauthSubject("google", victim.sub)` lookup either finds the real victim's existing row (full takeover) or `orElseGet`-creates a new row keyed on the victim's sub (which then takes over if/when the victim actually signs up later). A netscope JWT is issued via `jwt.issue(user.getId(), user.getEmail(), ...)`.

This is the textbook OIDC audience-confusion attack that section 3.1.3.7 of the OIDC spec exists to prevent. Severity rating (critical) is accurate: pre-auth, network-reachable, full account takeover, gated only by an operator remembering to set one env var.

**Recommended fix:**
Require the property at startup outside dev/test profiles (mirroring how `JwtService` already refuses to boot with the placeholder JWT secret per application.yml:113-120). Assert `claims.getAudience().contains(googleClientId)` in `fetchGoogleFromIdToken` before trusting any claims. Also pass `googleClientId` (non-null) to `DefaultJWTClaimsVerifier` so the library check fires as a second line of defense. Consider adding `azp` validation when present.

---

### F-RD3-06 — Unverified-email login enables permanent email-takeover + invite hijack

**Severity:** high
**Category:** email-takeover
**Location:** api/src/main/java/io/netscope/user/AuthController.java:96

**Claim:** Login is allowed regardless of `email_verified`. Both `fetchGoogle` (line 162) and `fetchGoogleFromIdToken` (line 183-185) READ `email_verified`, but `exchange()` (line 88-100) never refuses the registration when the flag is false — it just stores the false bit on the User row. Combined with `WorkspaceController#invite` (workspace/WorkspaceController.java:50) which resolves invitees with `users.findByEmail(req.email())`, this creates an email-takeover race: an attacker can register a Google account with `email=victim@corp.com` (no verification), squat the netscope user record for that email (the DB unique constraint on email subsequently locks the real victim out of registering), and from then on every workspace invite addressed to `victim@corp.com` routes to the attacker's account.

**Bypass path:**
CONFIRMED REAL. Traced full attack path:

1. `AuthController.exchange` (api/src/main/java/io/netscope/user/AuthController.java:88-100) does find-or-create by (oauth_provider, oauth_subject). For a fresh attacker sub, it inserts a new User row, storing `oauth.emailVerified()` as-is (line 96) — there is NO branch that rejects when `emailVerified` is false. Both `fetchGoogle` (line 162, default false) and `fetchGoogleFromIdToken` (line 183-185, `Boolean.TRUE.equals` → false on missing/false) faithfully propagate the unverified flag, but the caller never consults it as a gate.

2. `User.java` line 12 confirms `@Column(nullable = false, unique = true) private String email;` — a DB unique constraint exists on email. Once an attacker squats `victim@corp.com`, any later real-victim signup via a different provider hits `findByOauthProviderAndOauthSubject` → empty → `users.save(u)` with the same email → constraint violation → victim is permanently locked out of registering.

3. `WorkspaceController.invite` (workspace/WorkspaceController.java:50) resolves invitees solely by `users.findByEmail(req.email())` with no `email_verified` check. `WorkspaceService.invite` (WorkspaceService.java:67-72) only enforces the inviter's role and dedup; it accepts whatever userId came back. So every future workspace invite addressed to `victim@corp.com` binds the attacker's user_id to the workspace as ADMIN/MEMBER, granting the attacker access to org resources under the victim's identity.

The attack chain is reachable end-to-end with no intervening guard. Google's OIDC will issue id_tokens with `email_verified=false` for emails added to a consumer Google account without domain ownership verification (especially viable for corporate domains where the attacker cannot click the link), so the precondition is realistic.

**Recommended fix:**
In `AuthController.exchange`, throw `ApiException.forbidden` if `!oauth.emailVerified()` AND the email is not already bound to this `oauth_subject`. Alternatively store the email but mark the User row as `unverified` and refuse it as a workspace-invite target until verified out-of-band. Belt-and-braces: have `WorkspaceController.invite` / `WorkspaceService.invite` reject `findByEmail` results whose `email_verified` flag is false, so even if a future code path slips through the auth gate, the invite hijack vector is closed.

---

## Methodology

Static scan + adversarial verify (same as rounds 1 + 2). Round 3 widened the surface to JWT verification completeness (alg pinning, kid handling, required-claims), OAuth state / nonce / PKCE binding, CSRF on session-authenticated mutating routes, mass-assignment / DTO over-posting, outbound-TLS cert/hostname verification on every `HttpClient`, and Stripe webhook replay/idempotency. Each raw finding was traced end-to-end through controller → service → repository → outbound client, with library bytecode inspected where the verdict hinged on documented short-circuit behaviour (nimbus-jose-jwt `DefaultJWTClaimsVerifier` for F-RD3-01 and F-RD3-05). False positives were retired when an existing guard (e.g. issuer pinning, DB unique constraint, `RateLimitFilter` tier, `SessionCreationPolicy.STATELESS`, default JDK trust store) defeated the proposed attack path.
