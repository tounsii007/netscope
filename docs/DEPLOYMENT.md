# Deployment Guide

## Overview

```
Vercel (Next.js)  ─►  Fly.io / Railway (Spring Boot)  ─►  Neon PostgreSQL
                                   │
                                   └──►  Upstash Redis
```

## 1. Database — Neon (or Supabase)

1. Create project → copy `DATABASE_URL` (`postgresql://user:pass@host/db?sslmode=require`).
2. Flyway runs `V1__init.sql` on first boot of the API.

## 2. Redis — Upstash

1. Create database → copy `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`.

## 3. Backend — Fly.io

```bash
cd api
fly launch --no-deploy
fly secrets set \
  DATABASE_URL="postgresql://…" DATABASE_USER=… DATABASE_PASSWORD=… \
  REDIS_HOST=… REDIS_PORT=6379 \
  CORS_ORIGINS="https://netscope.io" \
  IPINFO_TOKEN="…"
fly deploy
```

`Dockerfile` for the API:

```dockerfile
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY . .
RUN ./mvnw -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-XX:+UseZGC","-jar","/app/app.jar"]
```

## 4. Frontend — Vercel

```bash
cd web
vercel link
vercel env add NEXT_PUBLIC_API_URL     # → https://api.netscope.io
vercel deploy --prod
```

Custom domain: `netscope.io` → Vercel, `api.netscope.io` → Fly.io.

## 5. DNS & TLS

- Cloudflare as the authoritative DNS
- Proxy only the apex; keep `api.netscope.io` DNS-only so the API sees real client IPs
- HSTS preload via `next.config.ts` headers

## 6. Observability

- Spring Actuator Prometheus endpoint → Grafana Cloud
- Sentry on both frontend and backend
- Structured JSON logs (Logback) → Fly.io log shipper → Better Stack

## 7. CI/CD (GitHub Actions)

- `web.yml`: typecheck, lint, build → preview deploy on PR, prod on main
- `api.yml`: `mvn verify` + integration tests with Testcontainers → Fly deploy on main

## 8. Scheduled Monitoring (multi-region)

- Run small Spring Boot worker in 3 regions (iad, fra, syd) consuming the `monitors` table.
- Results into `monitor_checks` — 1-min interval enforced per monitor, not per worker.

## 9. Security checklist

- [x] Private/loopback blocked in `TargetValidator`
- [x] Rate limit per IP + per API key
- [x] CORS limited to `netscope.io`
- [x] CSP, HSTS, X-Frame headers
- [ ] hCaptcha after 10 anon requests/min
- [ ] Audit log of all scans into `scans` table
