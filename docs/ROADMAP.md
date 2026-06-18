# Roadmap

## ✓ Shipped — 29 tools end-to-end

The 25 original tools across DNS, Network, Security, Email, Web Analysis,
plus the four added in the Q2 sprint:

- **DKIM Key Fetcher** — `/api/v1/dkim/{domain}` — public key + algorithm + bit length + revoked/weak warnings
- **CT Log Search** — `/api/v1/ct-logs/{domain}` — every CT-logged certificate for a domain, issuer rollup, mis-issuance detection
- **DoH / DoT Tester** — `/api/v1/doh/{domain}` — parallel probe across Cloudflare / Google / Quad9 / AdGuard / NextDNS, answer-consistency check
- **WebSocket Probe** — `/api/v1/websocket?url=` — real handshake + subprotocol + ping-pong RTT against ws:// or wss://

Each new tool is end-to-end: backend controller + service + tests, frontend
page + client, i18n EN + 10 placeholder locales, SDK method, CLI command.

### Depth boosts to existing tools (same sprint)

- **DNS Lookup** — added support for `SRV`, `PTR`, `TLSA`, `SVCB`,
  `HTTPS`, `DS`, `DNSKEY`, `RRSIG`, `NSEC`, `NSEC3`, `CDS`, `CDNSKEY`.
  New `?includeRrsig=true` flag surfaces matching signatures per record
  type; `?dnssecSummary=true` returns a compact chain-anchor summary
  (DS+DNSKEY presence + algorithm list) without invoking the full
  DnssecController.
- **SSL Inspector** — every chain entry now carries Key Usage, Extended
  Key Usage, AIA `caIssuers` and `ocsp` responder URLs, plus a per-link
  `signedByNext` cryptographic verification. Top-level `chainComplete`
  boolean tells monitors instantly whether the whole chain validates,
  and `hasSctExtension` flags Certificate Transparency proof embedding.

## v0.4 (next sprint)

- [ ] **Traceroute** — TCP-based via `IP_TTL` socket-option from a worker
      with `CAP_NET_ADMIN` (Fly.io supports it); falls back to system
      `traceroute` binary inside the API container if elevated.
- [ ] **HTTP/3 / QUIC probe** — uses Quiche bindings; reports negotiated
      version, retry count, 0-RTT eligibility.
- [ ] **SMTP RCPT-TO probe** — extension to `/api/v1/email/verify` that
      actually completes the `MAIL FROM` / `RCPT TO` SMTP handshake
      (non-spammy: bounded attempts, dedicated SMTP outbound IP).
- [ ] **TLS-handshake DoT** — current DoH/DoT tester only TCP-probes 853;
      add full handshake with cert-chain capture.
- [ ] **Reverse IP** — hackertarget.com or VirusTotal Passive DNS
      behind `/api/v1/reverse-ip/{ip}`
- [ ] **Bulk IP Checker** — CSV upload, async job via Redis queue,
      `/api/v1/bulk/ip`
- [ ] **Global Server Status** — deploy worker in 3 regions (Fly.io
      multi-region); aggregate regional results

## v1.0

- [ ] **CSP-nonce refactor** — drop `'unsafe-inline'` from script-src
      and style-src using per-request nonces threaded through `headers()`
- [ ] **GHAS enable** — un-gate CodeQL static analysis on the security
      workflow
- [ ] **next-auth stable** — move off `5.0.0-beta.31` once 5.0 GA ships
- [ ] **Historical uptime** — aggregate `monitor_checks` into hourly/
      daily rollups, show 90-day chart
- [ ] **Status-page incident publishing** — already wired in DB; add
      UI flow for posting + lifecycle (investigating → identified →
      monitoring → resolved)
