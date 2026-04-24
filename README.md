# NetScope — Network Diagnostics & IP Intelligence Platform

Produktionsreife SaaS-Plattform für Netzwerk-Diagnostik: Port Checker, IP Lookup, DNS, WHOIS, SSL, Reachability, Monitoring.

## Stack

| Layer        | Technologie                                                      |
| ------------ | ---------------------------------------------------------------- |
| Frontend     | Next.js 15 (App Router), TypeScript, TailwindCSS, shadcn/ui      |
| Karten       | react-leaflet + OpenStreetMap                                    |
| Charts       | Recharts                                                         |
| Backend      | Spring Boot 3.4, Java 21, Maven                                  |
| DB           | PostgreSQL 16 (Flyway Migrations)                                |
| Cache/Queue  | Redis 7 (Ergebnis-Cache, Rate-Limit via Bucket4j)                |
| Netz-Libs    | dnsjava, BouncyCastle (SSL), ICMP via Java NIO, JNA für Traceroute |
| GeoIP        | MaxMind GeoLite2 (lokal) + ipinfo.io Fallback                    |
| Auth (v2)    | Spring Security + JWT (API Keys für Developer Plan)              |
| Deployment   | Frontend: Vercel · Backend: Fly.io/Railway · DB: Neon/Supabase   |

## Architektur

```
┌─────────────────────┐       ┌──────────────────────┐       ┌────────────┐
│  Next.js (Vercel)   │──────▶│  Spring Boot API     │──────▶│ PostgreSQL │
│  SSR tool pages     │  REST │  /api/v1/*           │  JPA  │  + Flyway  │
│  SEO optimiert      │       │  Rate-Limit (Redis)  │       └────────────┘
└─────────────────────┘       │  Result-Cache        │──────▶┌────────────┐
          │                   └──────────┬───────────┘       │   Redis    │
          │                              │                   └────────────┘
          │                   ┌──────────▼───────────┐
          │                   │  Scheduled Monitors  │
          │                   │  (Spring @Scheduled) │
          │                   └──────────────────────┘
          │
          ▼
     OpenStreetMap · MaxMind · ipinfo · RDAP · DNS-Root
```

## Features (Status)

| #  | Feature              | MVP     |
| -- | -------------------- | ------- |
| 1  | Port Checker         | ✅      |
| 2  | Server Reachability  | ✅ (TCP/HTTP), 🟡 traceroute |
| 3  | IP Location Lookup   | ✅      |
| 4  | Proxy/VPN/TOR        | 🟡 Stub + TOR-Liste |
| 5  | DNS Lookup           | ✅      |
| 6  | Reverse IP Lookup    | 🟡 Stub (nutzt hackertarget API) |
| 7  | WHOIS                | ✅ (RDAP) |
| 8  | SSL Certificate      | ✅      |
| 9  | Global Server Status | 🟡 Architektur vorhanden (Worker in mehreren Regionen) |
| 10 | User IP Dashboard    | ✅      |
| 11 | DNS Propagation (15 resolvers) | ✅ |
| 12 | HTTP Security Headers (A+..F) | ✅ |
| 13 | Subdomain Finder (CT logs) | ✅ |
| 14 | CDN Detector         | ✅      |
| 15 | Bulk IP Checker      | 🟡      |
| 16 | Developer API        | ✅ (API-Key Header) |
| 17 | Scheduled Monitoring | 🟡      |

## Folder Structure

```
netscope/
├── web/                    # Next.js Frontend
│   ├── app/                # App Router
│   │   ├── (marketing)/    # Landing, Pricing, Docs
│   │   ├── (tools)/        # SEO-Tool-Seiten
│   │   │   ├── port-checker/
│   │   │   ├── ip-lookup/
│   │   │   ├── dns-lookup/
│   │   │   ├── whois/
│   │   │   ├── ssl-check/
│   │   │   └── reachability/
│   │   ├── dashboard/      # User IP + Monitoring
│   │   └── api/            # Edge-Proxy zu Backend
│   ├── components/
│   │   ├── ui/             # shadcn/ui Primitives
│   │   ├── tools/          # Tool-spezifische Komponenten
│   │   └── map/            # Leaflet-Karte
│   ├── lib/                # API-Client, Utils
│   └── public/
│
├── api/                    # Spring Boot Backend
│   ├── src/main/java/io/netscope/
│   │   ├── NetScopeApplication.java
│   │   ├── config/         # Security, Redis, CORS
│   │   ├── common/         # Exceptions, DTOs, RateLimit
│   │   ├── port/           # Port Checker Module
│   │   ├── dns/            # DNS Module
│   │   ├── ssl/            # SSL Module
│   │   ├── ip/             # IP Geo / Proxy Detection
│   │   ├── whois/          # RDAP Module
│   │   ├── reach/          # Ping / TCP / Traceroute
│   │   ├── monitor/        # Scheduled Monitoring
│   │   └── scan/           # Persistenz aller Scans
│   ├── src/main/resources/
│   │   ├── application.yml
│   │   └── db/migration/   # Flyway
│   └── pom.xml
│
├── docs/                   # Architektur, API, Deploy
├── docker-compose.yml      # Local dev: Postgres + Redis + Adminer
└── README.md
```

## Quick Start (lokal)

```bash
# 1. Infrastruktur
docker compose up -d

# 2. Backend
cd api && mvn spring-boot:run
# → http://localhost:8080/api/v1

# 3. Frontend
cd web && npm install && npm run dev
# → http://localhost:3000
```

## API Endpoints (v1)

| Method | Path                              | Beschreibung                     |
| ------ | --------------------------------- | -------------------------------- |
| POST   | `/api/v1/port/check`              | Einzelner Port                   |
| POST   | `/api/v1/port/scan`               | Port-Range oder Common-Ports     |
| GET    | `/api/v1/dns/{domain}?type=A,MX`  | DNS Records                      |
| GET    | `/api/v1/ssl/{host}?port=443`     | SSL Certificate Info             |
| GET    | `/api/v1/ip/{ip}`                 | Geo + ISP + ASN + Proxy-Flags    |
| GET    | `/api/v1/ip/me`                   | User-IP Dashboard                |
| GET    | `/api/v1/whois/{domain}`          | RDAP                             |
| POST   | `/api/v1/reach/check`             | HTTP + TCP Reachability          |
| POST   | `/api/v1/monitor`                 | Neuer Scheduled Monitor          |
| GET    | `/api/v1/monitor/{id}/history`    | Uptime-Historie                  |

Details: [docs/API.md](docs/API.md)

## Monetarisierung

- **Free**: 60 Requests/h, 1 Monitor, Public-Tools
- **Pro** (9€/Monat): 10k Requests/Tag, 25 Monitore, 1-min-Interval, Email-Alerts
- **Developer API** (29€/Monat): 100k Requests/Tag, REST + Webhooks, API-Key
- **Business** (99€/Monat): 1M Requests, SLA 99.9%, Slack/PagerDuty
- Ads nur auf Public-Tool-Seiten (Free-Tier) — Carbon Ads o.ä.

## Security & Anti-Abuse

- Rate-Limit via Redis+Bucket4j pro IP und API-Key
- Captcha (hCaptcha) bei Free-Tier nach 10 Requests/Min
- Blacklist für Scans gegen RFC1918, Loopback, Cloud-Metadata-IPs (169.254.169.254)
- Eigenes ASN-Subnetz wird nicht gescannt
- CORS streng (nur netscope.io Origin für Browser-Calls)
- HTTPS-only, HSTS, CSP Header

## Deployment

Siehe [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

Proprietary (© 2026 NetScope)
