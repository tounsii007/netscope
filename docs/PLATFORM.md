# Platform v1 — What ships

Option A is now implemented. The platform went from "tool collection" to
"SaaS product" with identity, billing, teams, status pages, webhooks, CT
monitoring, an SSL grader, a CLI, a GitHub Action and a TypeScript SDK.

## 1. Accounts (OAuth)

- `GitHub` + `Google` via NextAuth on the frontend
- Frontend POSTs the provider access_token to `POST /api/v1/auth/exchange`
- Backend verifies with the provider's `/userinfo`, upserts `users`, issues
  a first-party HS256 JWT (see [JwtService](../api/src/main/java/io/netscope/user/JwtService.java))
- JWT stays in the NextAuth server cookie — never exposed to browser JS

Config:
```
GITHUB_CLIENT_ID= / GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=
JWT_SECRET=  # >=32 chars, rotated via re-login
```

## 2. Stripe billing + usage metering

- `POST /billing/checkout` — creates hosted Checkout for a price_id
- `POST /billing/portal` — customer portal for invoices/cancel
- `POST /billing/webhook` — receives `checkout.session.completed`,
  `customer.subscription.*` and updates `workspaces.plan`
- `UsageService` INSERT ... ON CONFLICT for per-hour usage_counters per
  workspace + endpoint class

Config: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.
Price ids can match by containing "pro" / "business", or add explicit mapping
in `BillingController.mapPlan`.

## 3. Workspaces + roles

- Owner / Admin / Member (`WorkspaceMember.Role`)
- Every protected endpoint routes through `WorkspaceService.requireRole(...)`
- Invite by email via `POST /workspaces/{id}/members`
- Auto-created on first sign-in

## 4. Public Status Pages

- `POST /status-pages` — create (Owner/Admin)
- `POST /status-pages/{id}/incidents` — post updates
- `GET  /status-pages/public/{slug}` — **no auth**, ISR-cached at
  `/status/[slug]` on the frontend with SEO-friendly metadata

## 5. Webhook system

- HMAC-SHA256 on a `X-NetScope-Signature: sha256=...` header
- Secrets shown ONCE on creation (`POST /webhooks`), then redacted
- [WebhookDeliveryWorker](../api/src/main/java/io/netscope/webhook/WebhookDeliveryWorker.java)
  picks pending rows every 5s, fans out on virtual threads
- Exponential backoff: 1m → 5m → 30m → 2h → 6h → 24h (6 attempts, then DLQ via `dead_at`)
- Transport-specific payloads: `generic`, `slack`, `discord`, `pagerduty`
- Published via `ApplicationEventPublisher` — any service can call
  `publisher.publishEvent(new WebhookPublisher.DomainEvent(ws, type, data))`

## 6. CT Log Monitor

- Subscribe workspace → domain (`POST /ct/subscribe`)
- `CtScheduler` polls crt.sh every 10 min per subscription on virtual threads
- First-run silently sets high-water mark (no flood of existing certs)
- New certificates fire `ct.new_cert` domain event → webhooks + optional email alert
- Circuit-breaker `crtsh` protects us when crt.sh is down

## 7. SSL Labs-style grader

- `GET /ssl-grade/{host}?port=443`
- Grades A+..F based on: TLS version, forward secrecy (ECDHE/DHE), AEAD
  ciphers, key size, cert expiry, signature algorithm
- Cached 30 min in Redis

## 8. CLI (Go, single binary)

```
go install github.com/netscope/cli@latest
netscope port google.com 443
netscope audit mydomain.com
```

Static binary, zero runtime dependencies. Uses `NETSCOPE_API_KEY` + `NETSCOPE_API_URL`.

## 9. GitHub Action

```yaml
- uses: netscope/audit@v1
  with:
    target: mysite.com
    api-key: ${{ secrets.NETSCOPE_API_KEY }}
    fail-below: B
    fail-on-ssl-days: "14"
```

Emits job summary + `header-grade`, `ssl-grade`, `ssl-days-left` outputs.

## 10. TypeScript SDK (@netscope/sdk)

```ts
import { NetScope, NetScopeError } from "@netscope/sdk";
const ns = new NetScope({ apiKey: process.env.NETSCOPE_API_KEY });
const ssl = await ns.ssl.grade("mydomain.com");
```

- Zero dependencies, ESM + CJS, full types for every endpoint
- Built-in retry (429/5xx) with exponential backoff + `Retry-After`
- `NetScopeError` carries `.status` + `.body`

## Security summary

| Threat | Mitigation |
| --- | --- |
| OAuth token theft | NextAuth cookies only; backend JWT never in browser storage |
| Stripe webhook spoofing | `Webhook.constructEvent` with webhook secret |
| SSRF via webhook URL | Enforced `https://` only; IP blocked via TargetValidator-class logic in delivery worker (TODO: optional allowlist of public IPs) |
| DLQ flood | MAX_ATTEMPTS=6 then `dead_at` set, delivery stops |
| Privilege escalation | Every mutating endpoint calls `requireRole(...)` |
| Secret leak via API response | Webhook secret returned ONCE, redacted on list |
| CT log backpressure | Circuit-breaker + per-sub virtual thread |
| API key timing attack | `MessageDigest.isEqual` + SHA-256 compare |

## What's explicitly NOT done

- Automated email alerts (hooks into Resend/SES is a 1-day job — left deliberately out)
- SMS/Phone alerts
- Multi-region status page workers (architecture ready via ExecutorsConfig)
- Fine-grained RBAC beyond Owner/Admin/Member
- Audit log UI (backend already writes `security_events`)
