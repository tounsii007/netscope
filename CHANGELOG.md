# Changelog

All notable changes to Traceronix / NetScope are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes yet — see the latest release below._

## [0.2.0] — undefined

### Added

- Emit per-tool counter and latency histograms via new ToolMetrics facade for Prometheus (76bd964)
- Ship DKIM, CT-log, DoH/DoT, and WebSocket probe tools with deeper DNS and SSL inspection (2bcaf81)
- Verify Google id_tokens offline via cached JWKS, eliminating a userinfo round-trip (638bb7f)

### Changed

- Migrate web lint pipeline to ESLint 9 flat config for Next.js 16 compatibility (9bf2681)

### Security

- Centralise IDN domain normalisation across nine tool controllers to block homograph inputs (607ffab)
- Replace hand-rolled JWT with nimbus-jose-jwt to close algorithm-confusion foot-guns (f7fcd9b)
- Tighten IDN normalisation to STD3 ASCII rules, rejecting unassigned-codepoint homographs (0f10c8e)

### Performance

- Skip per-lookup Cache allocation in DNS bounded resolver via setCache(null) (c0615b1)
- Stream DKIM selector probes and short-circuit on first match for faster lookups (e66edb5)
- Switch rate limiter to weighted sliding window, closing the 2x burst at minute boundaries (c6131b1)
- Use ThreadLocalRandom for error-correlation IDs to skip SecureRandom contention (7432301)

### Fixed

- Fix AIA byte-scan, DoH double-dot regex, IDN homograph filter, and HttpClient init bugs (6eda89e)
- Repair build, tests, and migrate lint to ESLint 9 flat config for Next.js 16 (967d47b)
- Repair web typecheck and vitest failures around DKIM, websocket, and CSP report tests (f60b221)
- Thread the CSP nonce through root layout so production script-src no longer breaks (39a9411)

### Refactor

- Extract certificate field component out of SSL inspector client for reuse (598aa55)
- Group rate-limit components under a dedicated common/ratelimit subpackage (b4fa1d0)
- Group shared HTTP utilities under a dedicated common/http subpackage (4366e43)
- Group shared security helpers under a dedicated common/security subpackage (a43c973)
- Move DKIM and DoH probe executors to managed Spring beans with proper shutdown (a55f386)
- Reorganise common code into errors and observability subpackages for clearer boundaries (9d1b0e6)
- Split CT-log controller into row-normaliser, query, and fetcher domain helpers (45ca1c9)
- Split DKIM controller into record-parser, key-decoder, and selector-prober classes (65da785)
- Split DNS controller into record-describer, RRSIG-summary, and chain-summary helpers (2786d05)
- Split DoH controller into resolver directory, probe, and DoT-reachability helpers (3cb6f4c)
- Split rate-limit filter into sliding-window counter, key, and response-writer pieces (c15c2af)

### Documentation

- Add disaster-recovery runbook with explicit RTO and RPO targets (62b2c08)
- Clarify static CSP rationale in web documentation, dropping the misleading fallback wording (b9380fb)

---

[Unreleased]: https://github.com/tounsii007/netscope/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/tounsii007/netscope/releases/tag/v0.2.0
