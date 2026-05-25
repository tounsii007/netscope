# Security Policy

We take the security of Netscope seriously. Thank you for taking the
time to disclose responsibly.

## Reporting a vulnerability

**Do not open public GitHub issues for security reports.** Public
issues are indexed by automated scrapers and a window of disclosure
before a fix lands risks active exploitation against running tenants.

Use one of:

1. **GitHub private advisory** — [Report a vulnerability](https://github.com/tounsii007/netscope/security/advisories/new).
   This routes through GitHub's coordinated-disclosure flow and lets
   us push a CVE without intermediate public visibility.
2. **Email** — `security@netscope.io`. PGP fingerprint on request.

Please include:
- A concise description of the issue and its impact.
- Steps to reproduce (curl commands, screenshots, or a PoC repo).
- Affected component(s) — `api`, `web`, `cli`, `sdk`, infrastructure.
- Whether the issue is publicly known anywhere yet.

We acknowledge reports within **two business days** and aim to ship
a fix or formal remediation plan within **30 days** of triage. Critical
findings get faster turnaround; we'll keep you updated.

## Scope

In scope:

- The production frontend (`*.netscope.io`).
- The public API (`api.netscope.io/api/v1/**`).
- The CLI distribution (release binaries from this repo).
- Source code in this repository, including infrastructure-as-code.

Out of scope:

- Reports based purely on automated scanners with no demonstrable
  impact (e.g. "Server header reveals Tomcat") — already known and
  tracked separately.
- DoS via massive request volumes against the anonymous tier — the
  rate-limiter is the published mitigation; complaints about that
  budget are feature requests, not vulnerabilities.
- Issues in third-party services we integrate with (ipinfo.io,
  RIPEstat, MaxMind, Cloudflare, Stripe, etc.) — report those upstream.
- Social-engineering tests against staff.

## Defence-in-depth surfaces

Three places enforce the SSRF / open-redirect contract; all three
must agree. If you find a discrepancy between them, that's a real
finding even if no exploit path is obvious yet:

- `web/lib/target-guard.ts` (client-side, defence in depth)
- `api/src/main/java/io/netscope/common/TargetValidator.java`
- `api/src/main/java/io/netscope/ip/IpAddressGuard.java`

Adversarial test suites that lock the contract live next to each:

- `web/tests/target-guard-adversarial.test.ts`
- `web/tests/normalise-host-adversarial.test.ts`
- `api/src/test/java/io/netscope/common/TargetValidatorSsrfTest.java`
- `api/src/test/java/io/netscope/common/TargetValidatorAdditionalSsrfTest.java`
- `api/src/test/java/io/netscope/ip/IpAddressGuardTest.java`

## Safe harbour

We will not pursue legal action against good-faith security research
performed under this policy. Specifically:

- Stay within the scope above.
- Don't access, modify, or delete data that isn't your own.
- Don't run automated scans that take down the service for other users.
- Don't disclose publicly until we've shipped a fix or 90 days have
  passed since the initial report (whichever is sooner).

## Hall of fame

We credit researchers in release notes by handle of their choice
once the fix has shipped. If you'd prefer anonymous handling, say so
in the report.
