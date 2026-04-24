# Roadmap — remaining work

The scaffold ships a complete architecture with 7 features functional end-to-end. These remain:

## v0.2
- [ ] **Reverse IP** — integrate hackertarget.com API (free 100/day) behind `/api/v1/reverse-ip/{ip}`
- [ ] **Bulk IP Checker** — CSV upload, async job via Redis queue, `/api/v1/bulk/ip`
- [ ] **Scheduled Monitors** — `MonitorScheduler` with Spring `@Scheduled`, stores into `monitor_checks`
- [ ] **Email alerts** — Resend or SES, triggered on state transition

## v0.3
- [ ] **Global Server Status** — deploy worker in 3 regions (Fly.io multi-region); aggregate regional results
- [ ] **Traceroute** — JNI via NanoPing/jpcap or call system `traceroute`/`tracert` bounded by `TargetValidator`
- [ ] **Historical uptime** — aggregate `monitor_checks` into hourly/daily rollups, show 90-day chart
- [ ] **Webhooks** — outbound HMAC-signed events on monitor transitions

## v1.0
- [ ] **Auth** — Spring Security + Keycloak or simple email+magic-link
- [ ] **Billing** — Stripe subscription + API-key usage metering
- [ ] **Teams** — shared monitors, per-user API keys
- [ ] **Status pages** — public customer-facing status page per workspace
