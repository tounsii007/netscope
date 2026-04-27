# NetScope — Anleitung: Lokal & Server starten

Diese Anleitung führt dich Schritt für Schritt durch:
- **Teil A** — Lokale Entwicklung (dev mode, Hot-Reload)
- **Teil B** — Lokal als Production-Build (zum Testen vor Deploy)
- **Teil C** — Deployment auf einem Linux-Server (Docker Compose)
- **Teil D** — Deployment auf Kubernetes (für Production-SaaS)
- **Teil E** — Tests, Logs, Troubleshooting


================================================================================
TEIL A — LOKALE ENTWICKLUNG (Dev-Mode)
================================================================================

## A1. Voraussetzungen installieren

Du brauchst:
- **Java 21** oder neuer (Eclipse Temurin empfohlen)
- **Node.js 20** oder neuer (npm 10+)
- **Maven 3.9+**
- **Docker Desktop** (für Postgres + Redis)
- **Git**

Schnelltest, dass alles da ist:
```bash
java   --version    # 21+
node   --version    # 20+
npm    --version    # 10+
mvn    --version    # 3.9+
docker --version    # 24+
```

## A2. Repository klonen

```bash
git clone https://github.com/dein-user/netscope.git
cd netscope
```

## A3. Postgres + Redis hochfahren (über Docker)

Im Projektroot liegt `docker-compose.yml` mit Postgres 16, Redis 7 und Adminer.

```bash
docker compose up -d postgres redis
```

Verifizieren:
```bash
docker compose ps
# postgres + redis sollten "healthy" sein
```

(Optional) Adminer (DB-GUI auf http://localhost:8081) zusätzlich starten:
```bash
docker compose up -d adminer
# Login: System=PostgreSQL, Server=postgres, User=netscope, Pwd=netscope_dev, DB=netscope
```

## A4. Backend (Spring Boot API) starten

Terminal 1:
```bash
cd api
mvn spring-boot:run
```

Erwartete Ausgabe:
```
Started NetScopeApplication in X seconds
Tomcat started on port 8080
```

API-Health-Check:
```bash
curl http://localhost:8080/actuator/health
# {"status":"UP"}
```

## A5. Frontend (Next.js) starten

Terminal 2:
```bash
cd web
cp .env.example .env.local
npm install --legacy-peer-deps
npm run dev
```

Browser öffnen: **http://localhost:3000**

Sprachen testen:
- http://localhost:3000        → Englisch (Default)
- http://localhost:3000/de     → Deutsch
- http://localhost:3000/hi     → Hindi
- http://localhost:3000/zh     → Chinesisch

## A6. Was passiert beim Start?

- **Postgres** lauscht auf `localhost:5432` (User: `netscope` / Pwd: `netscope_dev` / DB: `netscope`)
- **Redis** lauscht auf `localhost:6379` (kein Passwort)
- **Backend-API** lauscht auf `localhost:8080`, läuft DB-Migrationen via Flyway automatisch
- **Frontend** lauscht auf `localhost:3000`, ruft die API über `NEXT_PUBLIC_API_URL` auf

## A7. Stoppen

```bash
# In jedem Terminal: Ctrl+C
docker compose down       # stoppt Postgres + Redis
docker compose down -v    # stoppt UND löscht alle DB-Daten (Vorsicht!)
```


================================================================================
TEIL B — LOKAL ALS PRODUCTION-BUILD
================================================================================

Sinnvoll, um vor dem Deploy zu testen, ob der Production-Build sauber läuft.

## B1. Backend bauen

```bash
cd api
mvn -B clean package -DskipTests          # ./target/netscope-api-*.jar
java -XX:+UseZGC -XX:MaxRAMPercentage=75 \
     -jar target/netscope-api-*.jar
```

## B2. Frontend bauen

```bash
cd web
npm install --legacy-peer-deps
npm run build
npm start                                  # Production-Server auf :3000
```

## B3. Smoke-Test

```bash
curl http://localhost:8080/actuator/health
curl http://localhost:3000
```


================================================================================
TEIL C — DEPLOYMENT AUF LINUX-SERVER (Docker Compose)
================================================================================

Empfohlen für: kleinen VPS (Hetzner, DigitalOcean Droplet), Single-Server-Setup.

## C1. Server vorbereiten

Auf dem Server (Ubuntu 22.04+ oder Debian 12+):

```bash
# Docker installieren
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Test
docker --version
docker compose version
```

## C2. Repository auf Server klonen

```bash
sudo mkdir -p /opt/netscope
sudo chown $USER /opt/netscope
git clone https://github.com/dein-user/netscope.git /opt/netscope
cd /opt/netscope
```

## C3. Production-`.env` anlegen

Im Projektroot eine Datei `.env.prod` erstellen (NICHT in Git committen!):

```bash
# Database
DATABASE_URL=jdbc:postgresql://postgres:5432/netscope
DATABASE_USER=netscope
DATABASE_PASSWORD=$(openssl rand -base64 32)

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$(openssl rand -base64 24)
REDIS_SSL=false

# JWT — KRITISCH! Production refused den Boot mit dem Default-Wert
JWT_SECRET=$(openssl rand -base64 48)
JWT_ISSUER=https://deine-domain.de
JWT_TTL=3600

# CORS — leerer Wert lässt App ABSICHTLICH nicht starten (Security)
CORS_ORIGINS=https://deine-domain.de

# Optional: externe Services
IPINFO_TOKEN=dein-ipinfo-token-hier
GEOIP_DB_PATH=/data/GeoLite2-City.mmdb
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Frontend
NEXT_PUBLIC_API_URL=https://api.deine-domain.de

# Spring profile
SPRING_PROFILES_ACTIVE=prod
```

Wichtig: Werte mit `openssl rand -base64 N` generieren, **NICHT** raten oder kopieren.

Permissions sichern:
```bash
chmod 600 .env.prod
```

## C4. Production docker-compose.yml schreiben

Lege `/opt/netscope/docker-compose.prod.yml` an:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: netscope
      POSTGRES_USER: ${DATABASE_USER}
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks: [internal]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DATABASE_USER}"]
      interval: 10s

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks: [internal]

  api:
    build: ./api
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_started }
    env_file: .env.prod
    networks: [internal, web]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  web:
    build: ./web
    restart: unless-stopped
    depends_on: [api]
    env_file: .env.prod
    networks: [web]

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on: [api, web]
    networks: [web]

volumes:
  pg_data:
  redis_data:

networks:
  internal:    # postgres + redis nur intern erreichbar
  web:         # api + web + nginx
```

## C5. nginx.conf für TLS-Terminierung

`/opt/netscope/nginx.conf`:

```nginx
events { worker_connections 1024; }

http {
    upstream api { server api:8080; }
    upstream web { server web:3000; }

    # API: api.deine-domain.de
    server {
        listen 443 ssl http2;
        server_name api.deine-domain.de;

        ssl_certificate     /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;

        # WICHTIG: forward-headers an Spring weiterreichen
        location / {
            proxy_pass http://api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # Frontend: deine-domain.de
    server {
        listen 443 ssl http2;
        server_name deine-domain.de www.deine-domain.de;

        ssl_certificate     /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;

        location / {
            proxy_pass http://web;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name deine-domain.de www.deine-domain.de api.deine-domain.de;
        return 301 https://$host$request_uri;
    }
}
```

## C6. Let's Encrypt Zertifikat holen

```bash
sudo apt install certbot
sudo certbot certonly --standalone \
    -d deine-domain.de -d www.deine-domain.de -d api.deine-domain.de
sudo cp /etc/letsencrypt/live/deine-domain.de/{fullchain,privkey}.pem \
        /opt/netscope/certs/
sudo chown $USER /opt/netscope/certs/*.pem
```

Auto-Renewal (cronjob):
```bash
sudo crontab -e
# Diese Zeile hinzufügen:
0 3 * * * certbot renew --quiet --post-hook "docker compose -f /opt/netscope/docker-compose.prod.yml restart nginx"
```

## C7. Erste Inbetriebnahme

```bash
cd /opt/netscope
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Verifizieren:
```bash
docker compose -f docker-compose.prod.yml ps
# Alle 5 Services "Up" / "healthy"

curl https://api.deine-domain.de/actuator/health
# {"status":"UP"}

curl -I https://deine-domain.de
# HTTP/2 200
```

## C8. Updates ausrollen

```bash
cd /opt/netscope
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## C9. Backup einrichten

Tägliches Postgres-Backup (cronjob):
```bash
mkdir -p /opt/netscope/backups
sudo crontab -e
```
```
0 2 * * * docker exec netscope-postgres-1 pg_dump -U netscope netscope | gzip > /opt/netscope/backups/netscope-$(date +\%F).sql.gz
0 3 * * 0 find /opt/netscope/backups -name "netscope-*.sql.gz" -mtime +30 -delete
```


================================================================================
TEIL D — KUBERNETES DEPLOYMENT (Production-SaaS)
================================================================================

Empfohlen für: skalierbare Production, mehrere Replicas, Auto-Scaling.

## D1. Voraussetzungen

- Kubernetes-Cluster (EKS, GKE, AKS, oder Hetzner Cloud k3s)
- `kubectl` konfiguriert (`kubectl cluster-info`)
- Container-Registry-Zugang (ghcr.io / Dockerhub)

## D2. Images bauen + pushen

```bash
# API
cd api
docker build -t ghcr.io/dein-org/netscope-api:1.0.0 .
docker push   ghcr.io/dein-org/netscope-api:1.0.0

# Frontend
cd ../web
docker build -t ghcr.io/dein-org/netscope-web:1.0.0 .
docker push   ghcr.io/dein-org/netscope-web:1.0.0
```

## D3. Namespace + Secrets anlegen

```bash
kubectl create namespace netscope

# DB-Credentials
kubectl create secret generic netscope-db -n netscope \
    --from-literal=url='jdbc:postgresql://postgres-host:5432/netscope' \
    --from-literal=user=netscope \
    --from-literal=password="$(openssl rand -base64 32)"

# Redis-Credentials
kubectl create secret generic netscope-redis -n netscope \
    --from-literal=host=redis-host \
    --from-literal=password="$(openssl rand -base64 24)"

# JWT + andere Secrets
kubectl create secret generic netscope-secrets -n netscope \
    --from-literal=jwt="$(openssl rand -base64 48)" \
    --from-literal=ipinfo='dein-ipinfo-token' \
    --from-literal=stripe-secret='sk_live_...' \
    --from-literal=stripe-webhook='whsec_...'
```

## D4. Manifests deployen

Im Repo unter `deploy/k8s/api-deployment.yaml` ist bereits ein Production-Manifest:
- 3 Replicas (HPA bis 20)
- Liveness + Readiness Probes
- Pod-Security: non-root, read-only filesystem, dropped capabilities
- NetworkPolicy: nur Ingress + DNS + HTTPS-Egress
- PodDisruptionBudget: minAvailable=2

```bash
kubectl apply -f deploy/k8s/api-deployment.yaml

# Status checken
kubectl -n netscope get pods,svc,hpa
kubectl -n netscope logs -f deployment/netscope-api
```

## D5. Frontend (Vercel empfohlen)

Das Frontend lässt sich am einfachsten auf **Vercel** hosten (Auto-Build aus Git):

1. https://vercel.com/new → GitHub-Repo verbinden
2. Build-Settings:
   - Framework Preset: Next.js
   - Root Directory: `web`
3. Environment Variables (Production):
   - `NEXT_PUBLIC_API_URL` = `https://api.deine-domain.de`

Vercel erkennt Next.js automatisch. Mit jedem Push auf `main` wird neu deployt.

Alternativ als eigener Pod im k8s-Cluster — Manifest analog zu `api-deployment.yaml`.


================================================================================
TEIL E — TESTS, LOGS, TROUBLESHOOTING
================================================================================

## E1. Tests ausführen

Backend:
```bash
cd api
mvn test                                        # alle Unit-Tests (~250)
mvn -DargLine= surefire:test                    # ohne JaCoCo-Agent (lokal schneller)
mvn verify                                      # inkl. Integration-Tests (braucht Docker)
mvn org.pitest:pitest-maven:mutationCoverage    # Mutation-Testing
```

Frontend:
```bash
cd web
npm test                                        # Vitest mit Coverage
npm run test:watch                              # Watch-Modus
npm run test:e2e                                # Playwright End-to-End
```

## E2. Log-Dateien (Production)

Backend schreibt nach `${LOG_PATH:-logs}/`:
- `server.YYYY-MM-DD.log`     — INFO und höher (30 Tage)
- `error.YYYY-MM-DD.log`      — nur ERRORs (90 Tage)
- `security.YYYY-MM-DD.log`   — Security-Events (365 Tage)
- `webhook.YYYY-MM-DD.log`    — Webhook-Deliveries
- `access.YYYY-MM-DD.log`     — HTTP-Requests
- Rotation: täglich um Mitternacht, ältere Files gzipped

Live verfolgen:
```bash
docker exec -it netscope-api tail -f /app/logs/server.$(date +%F).log
docker exec -it netscope-api tail -f /app/logs/error.$(date +%F).log
```

## E3. Häufige Probleme

**Problem: Backend startet nicht — `JWT secret is a known placeholder value`**
→ In Production muss `JWT_SECRET` gesetzt sein. `openssl rand -base64 48` generieren.

**Problem: Backend startet nicht — `netscope.cors.allowed-origins must be set`**
→ `CORS_ORIGINS` env var muss eine kommagetrennte Liste echter Domains sein.

**Problem: Frontend zeigt "API unreachable"**
→ `NEXT_PUBLIC_API_URL` prüfen. Bei lokaler Entwicklung sollte `http://localhost:8080` stehen.

**Problem: Postgres `password authentication failed`**
→ Container neu erstellen MIT volume-reset:
```bash
docker compose down -v
docker compose up -d postgres redis
```
(Vorsicht: löscht alle DB-Daten.)

**Problem: Tests hängen — Docker nicht erreichbar**
→ Integration-Tests brauchen Testcontainers. Docker Desktop muss laufen.
→ Oder nur Unit-Tests: `mvn surefire:test` (überspringt `*IT.java`).

**Problem: NPM-Install schlägt fehl wegen Peer-Dependency-Konflikt**
→ Mit `--legacy-peer-deps` installieren. Next.js 15 + next-auth 5-beta haben einige Konflikte mit React 19.

## E4. Health-Endpoints

Production-Server bietet:
- `GET /actuator/health`           — Gesamt-Status
- `GET /actuator/health/liveness`  — Pod ist am Leben
- `GET /actuator/health/readiness` — Pod kann Traffic empfangen
- `GET /actuator/prometheus`       — Metriken für Prometheus

## E5. Sicherheits-Checkliste vor Production-Go-Live

- [ ] `JWT_SECRET` ist 48+ zufällige Bytes (nicht der Default!)
- [ ] `CORS_ORIGINS` listet NUR die echten Frontend-Domains
- [ ] Postgres + Redis sind im internen Docker-Netzwerk (nicht öffentlich exposed)
- [ ] TLS-Zertifikate sind gültig (Let's Encrypt Auto-Renewal eingerichtet)
- [ ] `SPRING_PROFILES_ACTIVE=prod` ist gesetzt (sonst greift der JWT-Placeholder-Check nicht)
- [ ] Tägliches DB-Backup ist aktiv
- [ ] Log-Rotation funktioniert (alte Files werden gzipped/gelöscht)
- [ ] Dependency-Scan läuft (Trivy in CI ist bereits vorbereitet)
- [ ] Rate-Limit-Werte sind realistisch (`anonymous-per-minute=30`, `authenticated-per-minute=600` als Defaults)
- [ ] `.env.prod` ist NICHT in Git (`.gitignore` prüfen)


================================================================================
SCHNELLREFERENZ — Wichtigste Befehle
================================================================================

| Aktion                         | Befehl                                            |
| ------------------------------ | ------------------------------------------------- |
| Lokal alles starten            | `docker compose up -d` + `mvn spring-boot:run` + `npm run dev` |
| Lokal alles stoppen            | `docker compose down`                             |
| Backend-Tests                  | `cd api && mvn test`                              |
| Frontend-Tests                 | `cd web && npm test`                              |
| Production deployen            | `docker compose -f docker-compose.prod.yml up -d --build` |
| Production-Logs anzeigen       | `docker compose -f docker-compose.prod.yml logs -f api` |
| DB-Backup ziehen               | `docker exec netscope-postgres-1 pg_dump -U netscope netscope > backup.sql` |
| K8s-Deployment                 | `kubectl apply -f deploy/k8s/api-deployment.yaml` |
| K8s-Logs                       | `kubectl -n netscope logs -f deployment/netscope-api` |
| K8s-Pod-Restart                | `kubectl -n netscope rollout restart deployment/netscope-api` |

Bei Fragen: README.md (Stack-Übersicht) und docs/ (API-Referenz).
