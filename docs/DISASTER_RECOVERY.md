# Disaster Recovery Runbook

Recovery objectives:

| Objective | Target |
|---|---|
| **RTO** (Recovery Time Objective) | ≤ 30 minutes for the public tool surface; ≤ 4 hours for authenticated billing flows |
| **RPO** (Recovery Point Objective) | ≤ 1 hour for Postgres; ≤ 24 hours for monitor history (lossy by design) |
| **MTTR** (Mean Time To Recovery) | ≤ 1 hour for routine incidents (Redis flap, single-replica crash) |

The platform is designed to fail open: when Redis is unreachable, rate-limiting
is bypassed rather than hard-blocking every caller; when GeoIP providers
time out, the multi-source aggregator returns whatever partial data it has;
when the DNS resolver hangs, `BoundedDns` returns null after 3 seconds
rather than holding a virtual thread indefinitely. This isolates most
component failures to degraded UX rather than total outage.

## Component recovery matrix

| Component | Failure mode | First check | Recovery |
|---|---|---|---|
| Postgres | Connection refused / slow query | `/actuator/health/db` (returns DOWN), `kubectl describe statefulset netscope-postgres` | Restore from PITR snapshot (Fly volumes / managed-Postgres point-in-time) |
| Redis | TIMEOUT errors in logs | `/actuator/health/redis`, `kubectl logs netscope-redis` | Rolling restart, then restart of API replicas — keys regenerate from traffic |
| API replicas | 5xx ratio spike | Grafana `netscope.tool.calls{outcome="err"}` rate | HPA scales automatically; if pinned, `kubectl rollout restart deploy netscope-api` |
| Stripe webhook backlog | `webhook_delivery.dead_at` filling up | Grafana / `SELECT count(*) FROM webhook_delivery WHERE dead_at IS NULL AND next_retry_at < NOW() - INTERVAL '1 hour'` | Investigate underlying error, then `UPDATE webhook_delivery SET next_retry_at = NOW(), attempt = 0 WHERE dead_at IS NULL` |
| MaxMind GeoLite2 stale | All `/api/v1/ip/` results show stale countries | Build-info endpoint shows mmdb age | Rebuild image with fresh weekly GeoLite2 download |
| Cloudflare cache poisoning | Stale tool results across regions | Random sample with `?cache-bust=$(uuidgen)` | Purge Cloudflare cache, investigate Cache-Control headers |

## Postgres restore procedure

1. **Stop writes.** Scale the API deployment to zero replicas:
   ```bash
   kubectl scale deploy netscope-api --replicas=0
   ```
   This prevents in-flight transactions from racing the restore.

2. **Identify the target PITR timestamp.** Pull from the incident
   ticket — usually the last clean Grafana baseline before the
   incident began. Add 5 minute safety margin EARLIER than that
   timestamp to absorb clock skew between the app and the DB.

3. **Restore the volume snapshot.** Provider-specific:
   - **Fly.io managed Postgres**: `fly pg restore --app netscope-pg --snapshot <id>`
   - **Self-hosted on Fly volumes**: `flyctl volumes restore <vol-id> --snapshot <snap-id>`
   - **AWS RDS**: snapshot restore to a new instance, then DNS switch.

4. **Verify Flyway sync.** Boot one API replica with `SPRING_PROFILES_ACTIVE=verify`:
   ```bash
   kubectl run netscope-verify --image=ghcr.io/netscope/netscope-api:latest \
     --env=SPRING_PROFILES_ACTIVE=verify --restart=Never -it -- mvn flyway:info
   ```
   Confirm the migration history matches what was deployed.

5. **Scale up.** `kubectl scale deploy netscope-api --replicas=3` and
   monitor `/actuator/health` until all probes are passing.

6. **Post-restore queries to run:**
   ```sql
   -- Confirm last-known user state matches expectations
   SELECT count(*) AS user_count, max(created_at) AS most_recent
   FROM users;

   -- Identify any Stripe subscriptions that diverged during the
   -- restore window
   SELECT id, stripe_subscription_id, plan, updated_at
   FROM workspaces
   WHERE updated_at > NOW() - INTERVAL '1 hour';
   ```

## Redis recovery

Redis is cache + rate-limit only. **Data loss is acceptable** — every
key either regenerates from traffic (rate limits) or is re-derived from
Postgres (session lookups).

1. Drain the unhealthy node from the load balancer.
2. Force a fresh deploy: `kubectl delete pod netscope-redis-0`.
3. Replicas auto-rejoin the cluster.
4. Within 1-2 minutes, normal traffic warms the cache back.

## API container restart

Use a rolling restart, NOT a hard kill of all pods at once. The PDB
(`minAvailable: 2`) prevents accidental fleet-wide outage but a manual
`kubectl delete pod` of all three pods would still cause a 30-second
unavailability window.

```bash
kubectl rollout restart deploy netscope-api
kubectl rollout status deploy netscope-api --timeout=10m
```

## On-call escalation

| Severity | Owner | Pager | Response |
|---|---|---|---|
| **SEV-1** — public tool surface completely down | Primary on-call | PagerDuty | < 15 min ack, < 30 min mitigation start |
| **SEV-2** — authenticated flow degraded (billing, monitors) | Primary on-call | PagerDuty | < 30 min ack |
| **SEV-3** — single tool returning errors (others OK) | Primary on-call | Slack alert | < 4 hours ack |
| **SEV-4** — degraded performance, no errors | Engineering Slack | Slack notification | next business day |

After mitigation, every SEV-1 / SEV-2 requires a blameless postmortem
within 5 business days, posted in the `#postmortems` Slack channel.

## Backup verification

The recovery procedure above is exercised quarterly:

1. Restore the latest Postgres snapshot to a staging cluster
2. Run the test suite against the restored DB (`mvn -B verify`)
3. Confirm Flyway history matches production exactly
4. Document the wall-clock duration in `docs/dr-drill-log.md`

A drill that takes longer than the published RTO triggers an
investigation in the next sprint planning.

## What this runbook intentionally does NOT cover

- Multi-region failover — not yet implemented (tracked in
  `docs/ROADMAP.md` v1.0).
- DNS-level traffic shifting — handled at Cloudflare's edge; runbook
  for that lives in the infrastructure team's repo.
- Customer communication during incidents — owned by the status-page
  team via the customer-facing status page tool we built.
