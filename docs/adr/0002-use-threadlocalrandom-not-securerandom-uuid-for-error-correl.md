# 0002 — Use ThreadLocalRandom (not SecureRandom/UUID) for error-correlation IDs

**Status:** Accepted (2026-05-31)

## Context

`ApiException.sanitizedFailure(Logger, String, Throwable)` is the
project-wide pattern for handling caught upstream failures. It returns a
`HttpStatus.BAD_REQUEST` whose body is a fixed `publicMessage` plus a
parenthesised `(ref: <id>)`, while server-side it logs the full stack
under that same id via `log.error("[{}] {}", correlationId, ...)`. On-call
pivots from a customer-reported `ref` string to the actual stack trace.

The pattern exists to suppress three concrete leak classes the codebase
has seen: RIPE / crt.sh / Cloudflare CDN error messages that embed the
upstream server's IP or hostname; `RestClientException` /
`JdbcSQLException` / `java.net` messages that embed connection strings
or internal hostnames; and `NullPointerException` text inside a
downstream library whose message reveals the exact library version in
use.

The natural-feeling id source is `UUID.randomUUID()`. It is backed by
`SecureRandom`, which on Linux can block on `/dev/random` when the
entropy pool is starved. The moment entropy starvation is most likely is
the cold-start of a fresh container — cold caches, unwarmed connection
pools, fresh dependency probes failing — which is also the moment an
error storm is most likely to be in flight. The very pattern designed to
surface ids quickly during an incident would have pinned its own logging
thread on entropy waits.

## Decision

Generate correlation ids from `ThreadLocalRandom.current().nextBytes(16)`
hex-encoded via `HexFormat.of().formatHex(bytes)` — a fixed 32-char
lowercase-hex string. 128 bits gives the same collision-resistance space
as a v4 UUID for log-correlation cardinality, at zero blocking cost and
zero contention (each thread holds its own generator instance).

`newCorrelationId()` is deliberately package-private so the unit test
in the same package can pin the 32-hex-char format invariant without
exposing the helper as API.

## Consequences

Gave up the cryptographic unpredictability of the id. A `ref` string is
only a log-lookup key — knowing one grants no authority, reveals no
PII, and cannot be replayed against any endpoint — so unpredictability
is not a property we need here. A strict reading of "random id =
`SecureRandom`" would still object; the in-code comment at
`ApiException.java:53-54` calls the trade-off out explicitly ("NOT a
security-relevant primitive") so future readers don't widen the
exception to token/secret/session paths, where `SecureRandom` remains
mandatory.

Also accepted: a 32-char hex id reads as less "obviously a UUID" in
support tickets. Mitigated by the literal `ref:` prefix in the public
message making its role unambiguous.

## References

- `api/src/main/java/io/netscope/common/errors/ApiException.java:24-61` — `sanitizedFailure` with leak-class rationale
- `api/src/main/java/io/netscope/common/errors/ApiException.java:63-70` — `newCorrelationId` implementation + package-private test hook
