# NetScope REST API v1

Base URL: `https://api.netscope.io/api/v1` · Local: `http://localhost:8080/api/v1`
Interactive Swagger UI: `/swagger-ui`

## Auth

Two tiers:
- **Anonymous** — rate-limited per-IP (`60/min` default).
- **API Key** — send `X-API-Key: <key>`. Limit depends on plan.

## Errors

```json
{ "error": "Bad Request", "message": "…", "timestamp": "2026-04-24T…Z" }
```

| Status | Meaning                              |
| ------ | ------------------------------------ |
| 400    | invalid input                        |
| 403    | target forbidden (private/internal)  |
| 429    | rate limit exceeded                  |
| 500    | server error                         |

## Endpoints

### Port Checker

```http
POST /port/check
Content-Type: application/json

{ "target": "google.com", "port": 443, "protocol": "tcp", "timeoutMs": 2000 }
```

```http
POST /port/scan
{ "target": "example.com", "commonOnly": true }
{ "target": "1.1.1.1", "fromPort": 20, "toPort": 100 }
{ "target": "srv", "ports": [22, 80, 443] }
```

### DNS

```http
GET /dns/{domain}?type=A,AAAA,MX,TXT,NS,CNAME,SOA,CAA
```

### SSL

```http
GET /ssl/{host}?port=443
```

### IP

```http
GET /ip/{ip}      # geo + ASN + threat flags
GET /ip/me        # auto-detect caller + UA parsing
```

### WHOIS / RDAP

```http
GET /whois/{domain}
```

### Reachability

```http
POST /reach/check
{ "target": "cloudflare.com", "port": 443, "method": "auto" }
```

### Monitors (API key required)

```http
POST /monitor            # create
GET  /monitor            # list
GET  /monitor/{id}/history?since=24h
DELETE /monitor/{id}
```

## Rate limit headers

Every response includes `X-RateLimit-Remaining`.
