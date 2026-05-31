# 0004 — Security-headers parity: frontend and backend as defense-in-depth siblings, audited quarterly

**Status:** Accepted (undefined)

## Context

Frontend (`next.config.ts` `headers()`) and backend (`SecurityHeadersWriter`)
ship security headers independently. Without a parity check the two sets
drift — one side adds `X-Permitted-Cross-Domain-Policies`, the other forgets;
one tightens `Permissions-Policy`, the other doesn't. Drift means either a
defense gap or an audit confusion (the shipped-headers tool reports clean on
`/api/**` but dirty on `/`, or vice versa).

## Decision

Treat the two surfaces as defense-in-depth siblings, not a shared config.
Audit parity quarterly with the diff table below; act on the verdict column.

- **13 unique headers** — 7 in-sync, 4 intentional, 1 frontend-only, 1 backend-only, 0 hard drift.
- **Top action:** None critical. Optional polish: align backend HSTS `max-age` to the frontend's 2-year value (currently 1 year), and add backend `Reporting-Endpoints` if you want CSP report routing parity (low priority — backend CSP is `default-src 'none'` so violations are unlikely).

| Header | Frontend value | Backend value | Drift verdict | Action |
|---|---|---|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'; ...; report-uri /api/csp-report; report-to csp-endpoint` (full app policy) | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` | intentional | no action |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` (2y) | `max-age=31536000; includeSubDomains; preload` (1y) | intentional | no action (optional: bump backend to 63072000 for symmetry) |
| Referrer-Policy | `no-referrer` | `no-referrer` | in-sync | no action |
| Permissions-Policy | Full deny-list (~50 features, allows `clipboard-write=(self)`, `fullscreen=(self)`, `publickey-credentials-*=(self)`) | Short deny-list (8 features: accelerometer, camera, geolocation, gyroscope, magnetometer, microphone, payment, usb) | intentional | no action (API responses don't need a feature policy; short list is fine for defense-in-depth) |
| X-Frame-Options | `DENY` | `DENY` | in-sync | no action |
| X-Content-Type-Options | `nosniff` | `nosniff` | in-sync | no action |
| Cross-Origin-Opener-Policy | `same-origin` | `same-origin` | in-sync | no action |
| Cross-Origin-Resource-Policy | `same-origin` | `same-origin` | in-sync | no action |
| Cross-Origin-Embedder-Policy | `credentialless` | `credentialless` | in-sync | no action |
| Origin-Agent-Cluster | `?1` | `?1` | in-sync | no action |
| X-Permitted-Cross-Domain-Policies | `none` | `none` | in-sync | no action |
| X-DNS-Prefetch-Control | `off` | (not set) | frontend-only | no action (DNS-prefetch is a browser/HTML concern; irrelevant to JSON API responses) |
| Reporting-Endpoints | `csp-endpoint="/api/csp-report"` | (not set) | frontend-only | no action (backend CSP has no `report-to` directive, so endpoint mapping is unused) |
| Cache-Control | `public, max-age=31536000, immutable` on `/_next/static/*`; `public, max-age=86400, swr=604800` on icons/manifest | Dynamic per-URI via `CacheControlPolicy.resolveCacheControl` (skipped when null) | intentional | no action (frontend caches static assets; backend resolves per-endpoint freshness) |
| Pragma | (not set) | Dynamic — `no-cache` only when Cache-Control resolves to `no-store` | backend-only | no action (legacy HTTP/1.0 header; correctly scoped to backend no-store responses, not needed on frontend static assets) |

**Net:** No real drift. Frontend ships the broad browser-facing policy,
backend ships a narrow JSON-API hardening profile. The one cosmetic gap is
HSTS max-age (1y vs 2y); both meet preload requirements.

## Consequences

- Parity is a quarterly audit, not a runtime check. Drift means a PR to bring
  the lagging side into line.
- **ALWAYS update both sides in the same PR** when a new security header lands.
- If a header is intentionally one-sided, document why in the side that ships
  it (e.g. CSP-nonce only on `/`, not `/api/`, because the API never returns
  HTML).

## References

- `web/next.config.ts` — the `headers()` function
- `api/src/main/java/io/netscope/config/security/SecurityHeadersWriter.java`
- [0001 — SSRF defense](./0001-ssrf-defense-canonicalise-hostnames-via-idn-toascii-std3-wit.md) — related; SSRF defense is the other half of the picture
