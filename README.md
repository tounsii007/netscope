# Traceronix — Network Diagnostics & IP Intelligence Platform

Production-ready SaaS for developers, DevOps and security engineers. **29 network
diagnostic tools** in one fast, free, no-login web app — from Port Checker and
DNS Propagation across 15+ global resolvers to JWT decoding, BGP/ASN routing
inspection, IPv6 readiness scoring, multi-source IP geolocation comparison,
DKIM key fetching, Certificate Transparency log search, DoH/DoT cross-resolver
testing, WebSocket probing — and much more.

[![Tests](https://img.shields.io/badge/tests-vitest-success)]()
[![Locales](https://img.shields.io/badge/locales-11-blue)]()
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey)]()

---

## Stack

| Layer        | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| Frontend     | Next.js 16 (App Router) · React 19 · TypeScript · TailwindCSS    |
| i18n         | next-intl 4 — 11 locales (EN-US, DE, FR, ES, IT, PL, RU, UK, TR, HI, ZH) |
| Maps         | react-leaflet + OpenStreetMap                                    |
| Backend      | Spring Boot 3.5 · Java 21 · Maven                                |
| Database     | PostgreSQL 16 (Flyway migrations)                                |
| Cache / RL   | Redis 7 (result cache + Bucket4j rate limiter)                   |
| Net libs     | dnsjava · BouncyCastle · ICMP via NIO                            |
| GeoIP        | MaxMind GeoLite2 (local) + 4 fallback APIs in parallel           |
| Resilience   | Resilience4j circuit breakers + retry + timeout                  |
| Logging      | Winston + daily-rotate-file (server / error / access channels)   |
| Tests        | Vitest + RTL + jsdom · MSW · k6 for load                          |
| Deployment   | Frontend: Vercel · Backend: Fly.io · DB/Redis: managed           |

---

## Tools (29)

### DNS & Domain
DNS Lookup (22 record types incl. DNSSEC/RRSIG/SVCB/HTTPS) · DNS Propagation (15+ resolvers) · DNSSEC Validator · **DoH/DoT Tester** (5 resolvers) · WHOIS/RDAP · Subdomain Finder (CT logs) · **CT Log Search** (mis-issuance detection)

### Network
Port Checker · IP Lookup (multi-source compare) · IPv6 Readiness · BGP/ASN · CDN Detector · Reachability · **WebSocket Probe** (handshake + RTT)

### Security
SSL/TLS Inspector (full chain + KU/EKU + AIA + SCT) · IP Blacklist (20+ DNSBLs) · JWT Decoder · Password Leak (HIBP k-anonymity) · Mixed Content

### Email
Email Verifier · SPF/DKIM/DMARC Audit · **DKIM Key Fetcher** (per-selector key + algorithm + weakness warnings)

### Web Analysis
HTTP Security Headers (A+→F grade) · Tech Stack Detector · Redirect Tracer · OpenGraph Preview · Cookies & GDPR · Robots & Sitemap · Dashboard (My IP)

---

## Architecture

```
┌─────────────────────┐       ┌──────────────────────┐       ┌────────────┐
│  Next.js (Vercel)   │──────▶│  Spring Boot API     │──────▶│ PostgreSQL │
│  SSR tool pages     │  REST │  /api/v1/*           │  JPA  │  + Flyway  │
│  i18n × 11 · CSP    │       │  Bucket4j RL         │       └────────────┘
│  Web Vitals report  │       │  Resilience4j CB     │──────▶┌────────────┐
└─────────┬───────────┘       │  Multi-source agg    │       │   Redis    │
          │ /api/vitals       └──────────┬───────────┘       │  cache+RL  │
          ▼                              │                   └────────────┘
  Performance budget         ┌───────────▼──────────┐
  monitoring + CI gate       │  Scheduled Monitors  │
                             └──────────────────────┘
                                          │
                                          ▼
            OpenStreetMap · MaxMind · 4 GeoIP APIs · RDAP · DNSBL · CT logs
```

---

## Quick Start

```bash
# 1 — Infrastructure (Postgres + Redis + Adminer)
docker compose up -d

# 2 — Backend
cd api && mvn spring-boot:run
# → http://localhost:8080/api/v1

# 3 — Frontend
cd web && npm install && npm run dev
# → http://localhost:3000
```

### Production env vars (`web/.env`)

```dotenv
NEXT_PUBLIC_API_URL=https://api.traceronix.io
NEXT_PUBLIC_VITALS_ENDPOINT=/api/vitals    # optional
LOG_PATH=/var/log/traceronix               # default: ./logs
RATE_LIMIT_PER_MIN=120                     # IP-based, in-memory fallback
```

---

## Scripts

```bash
npm run dev           # Next.js dev server (Turbopack)
npm run build         # Production build
npm run start         # Production server
npm run lint          # next lint + Tailwind class linting
npm run typecheck     # tsc --noEmit
npm run test          # Vitest with V8 coverage report
npm run test:watch    # Vitest watch mode
npm run test:e2e      # Playwright end-to-end suite
npm run test:load:smoke    # k6 smoke (10 VUs, 1 min)
npm run test:load:standard # k6 load (100 VUs, 5 min)
npm run test:load:stress   # k6 stress (1000 VUs ramp, 10 min)
npm run test:load:spike    # k6 spike (5000 VUs sudden burst)
npm run perf:budget   # Bundle/Lighthouse budget gate
```

---

## Quality Gates (CI)

Every push runs:

1. **`lint`**     — ESLint flat config + Next.js rules
2. **`typecheck`** — Strict TypeScript across `app/`, `components/`, `lib/`
3. **`test`**     — Vitest unit + component, ≥80 % coverage on critical helpers
4. **`build`**    — Next.js production build (catches missing deps, env, types)

Load tests run on **manual dispatch** in `.github/workflows/load-test.yml` —
they hit a staging deployment, not production.

---

## Performance Targets

| Metric                              | Budget          |
| ----------------------------------- | --------------- |
| First Contentful Paint (p75)        | ≤ 1 800 ms      |
| Largest Contentful Paint (p75)      | ≤ 2 500 ms      |
| Interaction to Next Paint (p75)     | ≤ 200 ms        |
| Cumulative Layout Shift (p75)       | ≤ 0.1           |
| Time to First Byte (p75)            | ≤ 600 ms        |
| JS bundle (initial, gzipped)        | ≤ 180 KB        |
| Server response p95 — public tools  | ≤ 1 200 ms      |
| Server response p99 — public tools  | ≤ 3 000 ms      |
| Error rate (5xx)                    | < 0.1 %         |
| Throughput (sustained)              | ≥ 500 req/s     |

Web Vitals sampled client-side and POSTed to `/api/vitals` for aggregation.

---

## Security & Anti-Abuse

- **Headers (set in `next.config.ts`)** — CSP, HSTS preload, X-Frame-Options DENY,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, CORP.
  Self-audit by the included HTTP-Headers tool: target **A+**.
- **Rate limiting** — Bucket4j on the backend per IP + per API-key. Frontend
  middleware fallback when backend not reachable.
- **Privacy** — HIBP k-anonymity (only first 5 SHA-1 chars sent); JWT decoded
  client-side, never logged; no auth, no cookies beyond `NEXT_LOCALE`.
- **Scan blacklist** — RFC 1918, loopback, link-local and cloud metadata IPs
  (169.254.169.254) refused by the backend.
- **CORS** — strict `traceronix.io` origin allow-list.
- **Static assets** — middleware excludes file extensions so `/icon.png` and
  others don't get rewritten through the locale prefix.

---

## Folder Structure

```
traceronix/
├── api/                    # Spring Boot backend
│   └── src/main/java/io/netscope/...    (kept namespace stable)
├── web/                    # Next.js frontend
│   ├── app/                # App Router routes (i18n via [locale])
│   ├── components/         # UI components — every file ≤ 150 lines
│   ├── lib/                # api-client, logger, helpers (modular)
│   ├── messages/           # 11 locale bundles (595 strings each)
│   ├── tests/              # Vitest unit + component + integration
│   │   └── load/           # k6 scenarios (1000+ VU)
│   ├── public/             # Static assets (icon, flags, etc.)
│   ├── i18n/               # next-intl routing + request config
│   └── middleware.ts       # access logging + rate-limit + locale routing
├── scripts/                # One-shot helpers (explainer copy, etc.)
├── docs/                   # Architecture & deployment notes
├── .github/workflows/      # CI + manual load test
└── README.md
```

---

## Contributing

1. Fork → branch off `master` → PR
2. `npm run lint && npm run typecheck && npm run test` must pass
3. Keep new files ≤ 150 lines — split when they grow
4. Cross-module imports use the `@/` alias; siblings use `./`; **no `../`**
5. Add a unit test for any new helper in `lib/`

---

## License

Proprietary © 2026 Traceronix.
