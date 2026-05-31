# Frontend Security Review — 2026 Q2

**Reviewer:** workflow-driven adversarial scan over the Next.js + React surface
**Date:** undefined
**Scope:** web/app, web/components, web/lib, web/middleware.ts, web/next.config.ts

## Why a separate frontend pass

The five backend security rounds (docs/security-review-2026q2*.md) covered the
@RestController surface only. The frontend has its own attack surfaces that
static-Java scanners cannot see: XSS via React rendering, CSP wiring gaps,
client-side storage of tokens, open redirects via search params,
target="_blank" leakage, postMessage handlers without origin checks. This is
the first dedicated frontend pass.

## Summary

- Dimensions: 6 (XSS, CSP gaps, storage, open redirect, link rel, postMessage)
- Raw findings: 13
- Dedup: 13
- Adversarially verified: 13
- Confirmed real: 7
- False positives: 6

## Confirmed findings

### F-FE-01 — og:image URL passthrough lacks scheme allowlist (backend feeds frontend img sink)

**Severity:** low
**Category:** URL passthrough (backend, feeds the frontend finding above)
**Location:** api/src/main/java/io/netscope/pageinsight/OpenGraphController.java:91

**Claim:** resolve(base, ref) returns the raw ref string when URI.create(base).resolve(ref) throws, meaning a malformed og:image value flows verbatim into the JSON response and into the frontend <img src>. Combined with the frontend finding at opengraph/client.tsx:45, this is the codepath that lets attacker-controlled HTML choose the literal href the operator's browser fetches. Not XSS by itself, but it is the upstream of the lower-finding above and the right place to add a scheme allowlist (http|https only) before returning the field to the client.

**Bypass path:**
Confirmed at C:/projects/netscope/api/src/main/java/io/netscope/pageinsight/OpenGraphController.java:88-92. The resolve() helper has no scheme allowlist: on success it returns URI.create(base).resolve(ref).toString(); on exception (line 91) it returns the raw ref. Either way, an og:image value like "javascript:alert(1)" or "data:text/html,..." flows verbatim through line 60 (out.put("image", resolve(...))) into the JSON response, and the frontend at C:/projects/netscope/web/app/[locale]/opengraph/client.tsx:45 renders it into <img src={data.image}>. The finding correctly self-scopes as low severity and explicitly acknowledges it is "not XSS by itself" — browsers don't execute javascript:/data: URIs in <img src>, so React's escaping and CSP are not the relevant guards (the issue is not a render-time XSS sink, it's an unvalidated URL passthrough). The finding is accurate as a defense-in-depth gap: there is no scheme allowlist anywhere upstream of the JSON sink (grep confirms no scheme/http/allowlist/validate logic in the controller), so the attacker-controlled value lands in the operator's browser with whatever scheme the malicious page chose. The reproduction's emphasis on the catch branch is slightly off (the javascript: example actually succeeds at URI.resolve and never triggers the catch), but the underlying claim — "malformed og:image value flows verbatim into the JSON response and into <img src>" — is true on the success path too. The fix it recommends (add a scheme allowlist of http|https in resolve() before returning) is the correct mitigation and the right location.

**Recommended fix:**
Add an http/https scheme allowlist inside `resolve()` in OpenGraphController.java before returning either the resolved or raw ref string. Reject (or null out) any URI whose scheme is not in {"http", "https"} so attacker-controlled og:image values cannot smuggle javascript:/data:/file: schemes into the JSON response and onward into the frontend <img src> at web/app/[locale]/opengraph/client.tsx:45.

---

### F-FE-02 — Production CSP blocks every inline style attribute (style-src nonce does not apply to style="…")

**Severity:** high
**Category:** csp-style-src-blocks-inline-style-attributes
**Location:** web/lib/csp.ts:72

**Claim:** The production dynamic CSP sets `style-src 'self' 'nonce-<value>' fonts.googleapis.com` with NO `'unsafe-inline'` and NO `'unsafe-hashes'`. Browsers enforce `style-src-attr` independently and **CSP nonces do NOT apply to the HTML `style="..."` attribute** — only to `<style>` elements. Many components ship server-rendered/SSR-hydrated inline `style={{ ... }}` attributes (e.g. `components/floating/scroll-progress.tsx` line 57 `style={{ transform: 'scaleX(...)' }}`, `components/floating/back-to-top.tsx`, `components/toast/toast.tsx`, `components/home/hero.tsx`, `components/command-palette/command-palette.tsx`, `components/mobile-nav.tsx`, `components/not-found/hero-404.tsx`, plus six more under `app/[locale]/...`). In production, every one of those inline style attributes will be blocked by the browser, producing a CSP violation per render AND visually broken UI (no scroll progress, no toast animations, no hero animations). This is a real, browser-enforceable runtime bug — not a theoretical one. The static CSP in next.config.ts hides this in dev/local because it includes `'unsafe-inline'`, but middleware overrides it on every HTML route.

**Bypass path:**
Confirmed real. `web/lib/csp.ts:60-62,72` builds the production CSP as `style-src 'self' 'nonce-<value>' fonts.googleapis.com` — `styleExtras` is the empty string when `NODE_ENV === 'production'`, so neither `'unsafe-inline'` nor `'unsafe-hashes'` is present, and no separate `style-src-attr` exists. `web/middleware.ts:99` sets this header on every HTML response, overriding the more permissive `'unsafe-inline'`-bearing static CSP from `next.config.ts:68`.

The core technical claim is correct per the CSP Level 3 spec: nonces only validate `<style>` elements, not `style="..."` attributes. Because `style-src-attr` falls back to `style-src` and the policy contains no `'unsafe-inline'`/`'unsafe-hashes'` source, browsers will block every inline style attribute. The middleware comment at line 16 ("pass it to every <Script> + inline style tag") reflects this misunderstanding.

The inline-style usage is real and matches the claim exactly — 13 files confirmed:
- `web/components/floating/scroll-progress.tsx:57` — `style={{ transform: scaleX(...) }}` (the progress bar will never paint past zero width)
- `web/components/floating/back-to-top.tsx:41` — safe-area inset margins
- `web/components/toast/toast.tsx:123,153` — safe-area + animationDuration
- `web/components/home/hero.tsx:29,40,45` — animation timing on mesh + orbs
- `web/components/command-palette/command-palette.tsx:183,190` — open/close animation timings
- `web/components/mobile-nav.tsx`, `web/components/not-found/hero-404.tsx`
- Six page clients under `web/app/[locale]/` (`http-headers/_pieces/grade-card.tsx`, `ipv6/score-card.tsx`, `ip-lookup/threat-card.tsx`, `email-verify/client.tsx`, `cookies/client.tsx`, `blacklist/client.tsx`)

Production effect is browser-enforceable, not theoretical: every prod page render fires repeated `Refused to apply inline style…` console errors plus a POST to `/api/csp-report` per violation (rate-limit-exempt per middleware line 53-54, amplifying the cost), and visual elements degrade — scroll-progress bar stuck at 0 (it transforms via inline `scaleX`), toast/hero/command-palette animations regress to instant snaps, and iOS safe-area paddings vanish on the toast and back-to-top buttons. Dev hides this because `NODE_ENV !== 'production'` triggers the `'unsafe-inline'` branch on line 62.

**Recommended fix:**
Add a `style-src-attr 'self' 'unsafe-hashes' 'sha256-<hash-of-each-static-style>'` directive (best — keeps the nonce model intact for `<style>` elements), OR add `'unsafe-inline'` back to `style-src` (or `style-src-attr`) accepting the security regression, OR refactor the 13 sites to use CSS classes / CSS variables set via `<style nonce={n}>` blocks.

---

### F-FE-03 — CSP nonce leaked via `<meta http-equiv="x-csp-nonce">` defeats `'strict-dynamic'`

**Severity:** high
**Category:** csp-nonce-leaked-via-meta-tag
**Location:** web/app/[locale]/layout.tsx:84

**Claim:** `<meta httpEquiv="x-csp-nonce" content={nonce} />` writes the per-request CSP nonce into a DOM-readable meta tag. This is an **anti-pattern explicitly called out by Google's CSP team** (see https://csp.withgoogle.com/docs/strict-csp.html). The nonce is only secret from cross-origin scripts; any same-origin script that gains partial DOM-read access (e.g. through a sanitizer bypass, an XSS in a third-party library, or a DOM-clobbering primitive) can now read `document.head.querySelector('meta[http-equiv=x-csp-nonce]').content`. Combined with `'strict-dynamic'` in script-src, an attacker who reads the nonce can inject a single `<script nonce=…>document.write(…)</script>` and CSP will let it execute (strict-dynamic propagates the trust). The comment justifies the meta tag as 'for legacy browsers + scrapers' but no real browser reads CSP from a `<meta>` tag with a custom (non-CSP) `http-equiv`; `<meta http-equiv="Content-Security-Policy">` would, but that's not what is rendered. Net effect: zero defensive value, real attack-surface increase.

**Bypass path:**
CONFIRMED REAL. File C:/projects/netscope/web/app/[locale]/layout.tsx line 84 renders `{nonce ? <meta httpEquiv="x-csp-nonce" content={nonce} /> : null}`, which writes the per-request CSP nonce into a DOM-readable meta tag's `content` attribute.

Attack path is real because:

1. Production CSP includes `'strict-dynamic'` — confirmed at C:/projects/netscope/web/lib/csp.ts line 61: `const scriptExtras = isDev ? " 'unsafe-inline' 'unsafe-eval'" : " 'strict-dynamic'";` and the resulting policy is `script-src 'self' 'nonce-<value>' 'strict-dynamic'` in production. Strict-dynamic propagates trust to anything a nonce'd script (or a script carrying the matching nonce) injects — i.e., reading the nonce is sufficient to bypass script-src entirely.

2. The browser nonce-hiding protection that strict-dynamic depends on (per the HTML spec, since ~2018: a script element's `nonce` IDL attribute and `getAttribute('nonce')` both return empty string after parsing) does NOT apply to `<meta>` `content` attributes. So `document.head.querySelector('meta[http-equiv="x-csp-nonce"]').content` (or `.getAttribute('content')`) returns the live nonce to any same-origin script — exactly the leak strict-dynamic is designed to prevent. The nonce is meant to be secret from same-origin scripts that have a read-only DOM foothold; this meta tag voids that contract.

3. The justifying comment on lines 81-83 ("for the few legacy browsers + scrapers that prefer reading nonce out of <meta http-equiv> rather than the response header. Cheap belt + braces.") is technically incorrect. The only `<meta http-equiv>` value any browser parses for CSP is `Content-Security-Policy` (which carries the entire policy string, not just a nonce). A custom `http-equiv="x-csp-nonce"` is not in the CSP spec, not in HTML's standard http-equiv pragma list, and is not recognized by Chromium, Firefox, or Safari. It provides zero CSP enforcement benefit.

4. End-to-end attack: any HTML-injection primitive on the same origin (sanitizer bypass, mXSS, third-party widget compromise, DOM-clobbering primitive that yields DOM read access) that would normally be defeated by strict-dynamic + spec-hidden script nonces becomes an executable XSS via `meta.content` → inject `<script nonce=LEAKED>...</script>` → strict-dynamic allows it. The Google CSP team explicitly calls out this anti-pattern in csp.withgoogle.com/docs/strict-csp.html.

No upstream guard mitigates this: middleware (C:/projects/netscope/web/middleware.ts line 92) sets the nonce header and CSP, and layout faithfully writes it into both the meta tag (the sink) and the framework-threaded `<Script nonce>` tags (which the spec hides). React's auto-escaping is irrelevant — the attacker doesn't need to inject anything novel into the meta tag itself; the framework is writing the secret there by design. The dev-mode `unsafe-inline` branch is also irrelevant because strict-dynamic is the only relevant production behavior.

**Recommended fix:**
Delete lines 81-84 (the meta tag block). Keep the `headers().get('x-nonce')` read on line 77 so Next.js still treats the layout as per-request and continues auto-threading the nonce into framework-injected `<Script>` tags via the response CSP header, which is the only browser-recognized nonce transport.

---

### F-FE-04 — `base-uri 'self'` permits same-origin base-tag injection (should be `'none'`)

**Severity:** medium
**Category:** csp-base-uri-self-not-none
**Location:** web/lib/csp.ts:78

**Claim:** `base-uri 'self'` permits the page (or an injected attacker payload that can plant a `<base href>` tag) to set a base URL pointing anywhere within the same origin. Combined with any partial-HTML-injection primitive (a sanitizer bypass that lets `<base>` through, DOM-clobbering of `document.head`), this lets an attacker redirect every relative URL on the page — including `<script src="/_next/static/chunks/main.js">` — to a path of their choosing under the same origin (e.g. a directory that serves attacker-controlled JSON as JS via content-type confusion). Task explicitly flags this directive: 'base-uri not 'none' (base-tag injection)'. Application never renders a `<base>` element — `git grep -i '<base'` confirms zero usage. `'none'` is the strictly safer setting with no functional change.

**Bypass path:**
Confirmed real medium-severity CSP hardening gap. Both lib/csp.ts:78 and next.config.ts:74 emit `base-uri 'self'`. Grepping the entire web/ tree for `<base` (case-insensitive) returns zero matches — the application never renders a `<base>` element, so `'none'` is functionally equivalent and strictly safer. There is no `dangerouslySetInnerHTML` anywhere in the codebase (grep returns zero hits) and React's automatic JSX escaping makes the trivial XSS-→-base-tag-injection path very hard today, BUT that is exactly the reason CSP exists: defense-in-depth that catches the next-bug scenario. `base-uri 'self'` permits any same-origin path to be set as the base URL; combined with a future sanitizer-bypass, DOM-clobbering, or template-injection bug, an attacker could redirect every relative `<script src>` (including `/_next/static/chunks/*.js`) to a same-origin attacker-controlled path. The CSP already follows the deny-elements-we-don't-use pattern for `object-src 'none'`, `frame-src 'none'`, and `frame-ancestors 'none'`; `base-uri` should match. Fix is mechanical with zero functional risk: replace `'self'` with `'none'` in both lib/csp.ts:78 and next.config.ts:74. This is the same pattern OWASP's CSP cheat sheet and Google's csp-evaluator flag — `base-uri 'self'` is suboptimal when no `<base>` element is rendered.

**Recommended fix:**
Replace `'self'` with `'none'` in `base-uri` in both web/lib/csp.ts:78 and web/next.config.ts:74. Zero functional risk because the application never renders a `<base>` element (grep confirmed). Aligns with the existing deny-elements-we-don't-use pattern already applied to `object-src 'none'`, `frame-src 'none'`, and `frame-ancestors 'none'`.

---

### F-FE-05 — Missing `redirect` callback + no `trustHost` pin lets `X-Forwarded-Host` spoof callback origin

**Severity:** medium
**Category:** Open redirect (config gap) — missing explicit `redirect` callback and `trustHost`
**Location:** web/auth.ts:71

**Claim:** The NextAuth config in `web/auth.ts` defines `callbacks.jwt` and `callbacks.session` but DOES NOT define a `redirect` callback, and never sets `trustHost`. It therefore relies entirely on the next-auth default `redirect` implementation in `@auth/core/src/lib/init.ts` lines 33-37 (`if (url.startsWith('/')) return ${baseUrl}${url}; else if (new URL(url).origin === baseUrl) return url; return baseUrl;`). For that default to be safe the `baseUrl` must itself be trustworthy. Per `@auth/core/src/lib/utils/env.ts` line 44-50, `trustHost` is auto-set to `true` whenever ANY of `AUTH_URL`, `AUTH_TRUST_HOST`, `VERCEL`, `CF_PAGES` is set OR `NODE_ENV !== 'production'`. No `AUTH_URL` is configured anywhere in the repo (grep finds zero matches outside next-auth's own README copy). When the app runs in dev / Docker / preview environments without `AUTH_URL`, `createActionURL` (env.ts lines 93-102) derives `baseUrl` from the request's `x-forwarded-host` (or `host`) header without validation, and the default redirect callback then treats that attacker-controlled origin as same-origin. An attacker who can make a victim send a sign-in request with `X-Forwarded-Host: attacker.example` (e.g. via a malicious frontend proxy, a misconfigured CDN rule, or in local-dev / staging) gets `callbackUrl=https://attacker.example/...` accepted as 'same-origin' and the post-sign-in 302 lands on attacker.example. Defence in depth would be (a) a defensive `redirect` callback in `auth.ts` that hard-pins targets to a small static allowlist of internal paths (`/`, `/app`, `/dashboard`), and (b) explicit `trustHost: true` ONLY when paired with `AUTH_URL` so misconfigured deployments fail closed rather than fall through to host-header derivation.

**Bypass path:**
Verified in source. `web/auth.ts` (lines 58-95) defines only `callbacks.jwt` and `callbacks.session` — no `redirect` callback, no `trustHost`. Confirmed by grep that `AUTH_URL`, `AUTH_TRUST_HOST`, and `trustHost` do not appear anywhere in the repo outside `node_modules`. Inspected the vendored next-auth source: (1) `@auth/core/src/lib/utils/env.ts:44-50` auto-sets `trustHost = true` when `AUTH_URL`, `AUTH_TRUST_HOST`, `VERCEL`, `CF_PAGES`, OR `NODE_ENV !== "production"` is truthy — so dev/preview/Docker runs without `AUTH_URL` are auto-trusted; (2) `createActionURL` (env.ts:84-102) derives the base URL from `x-forwarded-host` / `host` headers when `AUTH_URL` is unset, with no header validation; (3) the default redirect callback at `init.ts:33-37` is the exact code the finding quotes — it treats any URL whose `.origin === baseUrl` as same-origin and returns it verbatim; (4) the upstream `isValidHttpUrl` guard at `assert.ts:33-41` only checks for `https?:` protocol using `url.origin` (already derived from spoofed host) as base, so it does NOT reject cross-origin attacker callback URLs once the host is trusted. The attack chain holds: in any non-production or self-hosted-with-AUTH_TRUST_HOST environment where a reverse proxy forwards client-supplied `X-Forwarded-Host`, a crafted `/api/auth/signin/<provider>?callbackUrl=https://attacker.example/pwn` request derives `baseUrl=https://attacker.example`, the default redirect callback sees it as same-origin, the callback URL cookie is set to attacker.example, and the post-OAuth 302 lands on the attacker domain. The app's own sign-in page hard-codes `redirectTo: "/app"` (sign-in/page.tsx:69,78), but that does not protect victims tricked into the crafted URL since CSRF protects the POST but the callbackUrl cookie still survives the GitHub/Google round trip. The proposed mitigation (defensive `redirect` callback pinning to a path allowlist + explicit `trustHost: true` only when paired with `AUTH_URL`) is the correct fail-closed posture. Severity medium is appropriate: conditioned on env (NODE_ENV !== production, or self-hosted with a naive proxy), but a real defense-in-depth gap with a concrete attack path.

**Recommended fix:**
(a) Add a defensive `redirect` callback to `web/auth.ts` that hard-pins targets to a small static allowlist of internal paths (e.g. `/`, `/dashboard`) and reject anything else with a default-safe fallback. (b) Require `AUTH_URL` to be set in every deployment that runs outside development, and set `trustHost: true` explicitly only when paired with `AUTH_URL`, so misconfigured deployments fail closed rather than falling back to `x-forwarded-host` derivation.

---

### F-FE-06 — Sign-in redirects to nonexistent `/app` route, landing users on localized 404

**Severity:** low
**Category:** Broken redirect target — `/app` route does not exist
**Location:** web/app/[locale]/sign-in/page.tsx:69

**Claim:** Both sign-in forms call `signIn(<provider>, { redirectTo: '/app' })` at lines 69 and 78, but the app has NO `/app` route. `ls web/app/[locale]/` shows no `app/` subdirectory; the actual post-sign-in landing should be `/dashboard` (which exists). After a successful OAuth round-trip the user is bounced to a localized 404. This is not an open redirect per se, but it (a) trains users to land on an unexpected URL — a pattern that makes future open-redirect bugs more believable to victims, and (b) means the only hardcoded internal redirect destination in the app is a dead route, so there is currently no positive test that the sign-in→landing redirect actually works.

**Bypass path:**
Confirmed both literals at web/app/[locale]/sign-in/page.tsx:69 and :78 — `signIn("github", { redirectTo: "/app" })` and `signIn("google", { redirectTo: "/app" })`. The route is dead: `web/app/[locale]/` contains `dashboard/` but no `app/` subdirectory, and `web/app/` itself is the App Router root (children: `[locale]/`, `api/`, `globals.css`, `layout.tsx`, `robots.ts`, `sitemap.ts`) with no `app/` either. Nothing rescues the redirect: `next.config.ts` only rewrites `/api/v1/:path*` to the backend — no `redirects()` block, no `/app → /dashboard` mapping. `auth.ts` defines no `redirect` callback, so next-auth performs only its standard same-origin check on `redirectTo` and then follows the literal. The next-intl middleware (`localePrefix: "as-needed"`, locales `["en","de","fr","es","it","pl","ru","uk","tr","hi","zh"]`) treats `/app` as a non-locale path under the default locale; with no `[locale]/app/page.tsx`, the catch-all `[locale]/[...rest]/page.tsx` calls `notFound()` and the user lands on the localized 404 after a successful OAuth round-trip — exactly the reproduction the reporter describes. Severity framing is correct: this is not an open redirect (the value is a hardcoded same-origin literal, not user-controlled), but it is a real broken-redirect bug with the cited UX/positive-test-coverage downsides. Fix is to change both literals to `/dashboard` (the route that actually exists).

**Recommended fix:**
Change both `redirectTo: "/app"` literals at web/app/[locale]/sign-in/page.tsx:69 and :78 to `redirectTo: "/dashboard"`, matching the actual route that exists. Add a Playwright (or equivalent) integration test that walks the GitHub/Google sign-in stub end-to-end and asserts the post-callback URL equals `/dashboard`, so future redirect drift is caught.

---

### F-FE-07 — `[...nextauth]` catch-all delegates without a path-level callbackUrl allowlist

**Severity:** low
**Category:** Open redirect surface — `callbackUrl` query param accepted with no app-level allowlist
**Location:** web/app/api/auth/[...nextauth]/route.ts:2

**Claim:** The catch-all next-auth route at `web/app/api/auth/[...nextauth]/route.ts` exports `GET, POST` from `@/auth` handlers verbatim with no wrapping. This means every next-auth sign-in/sign-out/callback URL accepts a user-supplied `callbackUrl` query parameter (e.g. `/api/auth/signin/github?callbackUrl=<attacker controlled>` and `/api/auth/signout?callbackUrl=<attacker controlled>`) and `/api/auth/callback/<provider>?callbackUrl=<attacker controlled>`. The only check is the default `redirect` callback in `init.ts` lines 33-37. Whilst that default rejects cross-origin absolute URLs, it ACCEPTS any path starting with `/` and prefixes it with baseUrl. Because the app has no internal-path allowlist, an attacker can pivot a user to ANY internal route via a crafted sign-in link — e.g. `callbackUrl=/api/auth/signout` would log the user out immediately on sign-in, or `callbackUrl=/dashboard?banner=<phishing-html>` would land them on a controlled-query-string variant of dashboard if any rendering code later trusts query strings. Defence in depth: wrap the next-auth handler and rewrite/validate `callbackUrl` before delegation, OR define a custom `redirect` callback in `auth.ts` that hard-allowlists to `{ '/', '/dashboard', '/app' }`.

**Bypass path:**
Verified the three concrete code claims:

1. `web/app/api/auth/[...nextauth]/route.ts` (lines 1-3) does export `{ GET, POST } = handlers` from `@/auth` verbatim, with zero wrapping or validation.

2. `web/auth.ts` (lines 58-95) defines only `jwt` and `session` callbacks — there is NO custom `redirect` callback. So next-auth falls back to its default.

3. The default redirect callback at `web/node_modules/@auth/core/src/lib/init.ts` lines 33-37 is exactly:
   ```
   redirect({ url, baseUrl }) {
     if (url.startsWith("/")) return `${baseUrl}${url}`
     else if (new URL(url).origin === baseUrl) return url
     return baseUrl
   }
   ```
   And `web/node_modules/@auth/core/src/lib/utils/callback-url.ts` confirms this callback is invoked with the user-supplied query/form value for `callbackUrl`.

The data-flow attack path is therefore real: `?callbackUrl=/anything-internal` flows through `createCallbackUrl` → `callbacks.redirect({ url: "/anything-internal", baseUrl })` → returns `${baseUrl}/anything-internal` → 302 issued by next-auth.

Mitigating context (consistent with the finding's already-low severity tag):
- The default callback DOES block cross-origin redirects (`new URL(url).origin === baseUrl`), so this is NOT a classic phishing-grade open redirect to attacker-controlled domains.
- `signOut` requires POST + CSRF; a GET to `/api/auth/signout` renders a confirmation form (web/node_modules/@auth/core/src/lib/index.ts case "signout" → render.signout()), so the reproduction's "log the user out immediately" framing is somewhat overstated.
- Grepping the whole `web/app` tree for `dangerouslySetInnerHTML` returns zero matches, so the "phishing-html banner via query string" sub-claim has no current XSS amplifier.

Even with those caveats, the core technical claim stands: the catch-all route accepts any user-supplied `callbackUrl` parameter and the only validation hard-allowlists ORIGINS, not PATHS. An attacker-crafted sign-in link can pivot a logged-in user to any same-origin internal path (incl. paths that take their own query strings). The recommended defense-in-depth mitigation (custom `redirect` callback in auth.ts with an internal-path allowlist OR a wrapping handler in route.ts that validates `callbackUrl` before delegation) is sound.

**Recommended fix:**
Either (a) add a custom `redirect` callback to web/auth.ts that hard-allowlists `callbackUrl` to a small set of internal paths (e.g. `{ "/", "/dashboard" }`) and rejects everything else with a default-safe fallback, OR (b) wrap the `[...nextauth]` GET/POST exports in web/app/api/auth/[...nextauth]/route.ts and validate/rewrite the `callbackUrl` query parameter before delegating to the next-auth handler. Option (a) is the smaller, more idiomatic patch and also closes F-FE-05.

---

## Methodology

Static scan + adversarial verify (same approach as the backend rounds 1-4). This first dedicated frontend pass widened the surface to six frontend-only dimensions that the prior Java-only rounds could not see: (1) XSS via React rendering (including `dangerouslySetInnerHTML`, JSX URL attributes, and `<img src>`/`<a href>` sinks fed by API responses), (2) CSP wiring gaps in `web/lib/csp.ts`, `web/middleware.ts`, and `web/next.config.ts` (nonce propagation, `'strict-dynamic'` integrity, `style-src-attr`/`script-src-attr` fallbacks, `base-uri`, `object-src`, `frame-ancestors`), (3) client-side storage of tokens (localStorage/sessionStorage/IndexedDB inspection plus cookie-flag review), (4) open-redirect surfaces via search params and next-auth `callbackUrl` plumbing, (5) `target="_blank"` / `rel="noopener noreferrer"` link hygiene and external-link leakage, (6) `postMessage` handler audit for missing origin checks. Each raw finding was traced end-to-end through the layout / page / component / middleware boundary, with in-repo "good" patterns (e.g. middleware's per-request nonce, the static CSP fallback in `next.config.ts`, next-auth's same-origin guard) used as the bar for "this can be fixed with an existing pattern." False positives were retired when an existing guard (React's automatic JSX escaping, Next.js's `javascript:`-scheme block in `next/link`, the static `SECURITY_HEADERS` array, httpOnly session-cookie storage, the same-origin check inside next-auth's default redirect callback, the absence of any `dangerouslySetInnerHTML` or user-controlled `iframe src` in the tree) defeated the proposed attack path. Where a backend codepath fed the frontend sink (F-FE-01), the finding was scoped to the backend location with an explicit cross-reference to the frontend renderer so the upstream allowlist is added at the right altitude.
