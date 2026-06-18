# 0003 — Dependency bump policy: gate Dependabot, ungroup pre-1.0 / known-breaking majors

**Status:** Accepted (2026-05-30)

## Context

On 2026-05-14 Dependabot opened a PR bumping `io.rest-assured:rest-assured`
from `5.5.0` to `6.0.0`. It was merged into `master` without a CI gate.
6.0.0 switched the default response-body mapper to Jackson 3
(`tools.jackson.databind`), which conflicts with the Jackson 2 line that
Spring Boot 3.5's BOM manages. The integration suite failed on the first
run after merge. `master` stayed red for 16 days until commit `a80e452`
re-pinned to `5.5.0`. Merge-without-gate is the policy failure that let
it land. This ADR freezes a per-dependency triage and a Dependabot
grouping rule so the same shape of failure cannot recur.

## Decision

| Dependency | Declared → Suggested | Action | Reason |
|---|---|---|---|
| `io.rest-assured:rest-assured` (test) | `5.5.0` → `5.5.2` | pin + monitor | 6.0.0 breaks CI — defaults body-mapper to Jackson 3 (`tools.jackson.databind`) which conflicts with Spring Boot 3.5's managed Jackson 2. Patch-bump inside 5.x is safe; hold 6.x until Spring Boot pulls Jackson 3 (or pin a `rest-assured-jackson2` mapper). Block Dependabot from floating to 6.x. |
| `next-auth` | `5.0.0-beta.31` → `5.0.0-beta.31` | pin + monitor | On the 5.0 beta channel. Beta-to-beta jumps have shipped breaking changes (session callback signatures, provider keys). Task #10 already pinned out of the open beta range. Hold until 5.0 GA, then plan a focused migration PR — do not auto-bump. |
| `tailwind-merge` | `2.6.0` → `2.6.0` | pin + monitor | 3.x dropped CommonJS, restructured presets, exposed a new `twMerge` config API. Used through `cn` helper across `ssl-check/_pieces` and `http-headers/_pieces` (iters 29/30). Pin to 2.x until a deliberate refactor PR. |
| `lucide-react` | `0.577.0` → `1.17.0` | investigate | Pre-1.0 minors are by convention breaking, so 0.577 → 1.x is effectively a major. Icon renames and tree-shaking entry-point changes are the usual breakage. Low-blast-radius but needs a focused PR: bump, `tsc`, visually scan icons. |
| `org.springdoc:springdoc-openapi-starter-webmvc-ui` | `2.7.0` → `2.8.6` | bump now | One minor behind. 2.8.x aligns with Spring Boot 3.5 and bundles Swagger-UI 5.18. No documented breaking config changes for the `@OpenAPIDefinition` surface added in commit d33496a. Verify `/v3/api-docs` + `/swagger-ui.html` post-bump. |
| `com.nimbusds:nimbus-jose-jwt` | `10.0.2` → `10.3` | bump now | Same major. No breaking changes for HS256 / JWKS RS256 paths used by `JwtService` (iter 10). |
| `com.maxmind.geoip2:geoip2` | `4.2.1` → `4.3.0` | bump now | One minor behind. 4.3.0 added builder options + a new database-type enum; existing callers stay source-compatible. |
| `com.stripe:stripe-java` | `29.0.0` → latest 29.x stable | bump now | Same major. Stay inside 29.x — 30.x historically renames request-options classes. Read changelog before any future major. |
| `next-intl` | `^4.11.2` → `4.13.0` | bump now | Caret already permits. 4.x stable on Next 16 App Router; no breaking changes since 4.10. May already be resolved in the lockfile. |
| `org.springframework.boot:spring-boot-starter-parent` | `3.5.14` → `3.5.14` | pin + monitor | Anchor BOM, already current. Solr's "3.5.3" leaderboard answer is stale — trust the pom comment. Do NOT downgrade. Next move is 3.6.x once GA. |
| `org.postgresql:postgresql` (override) | `42.7.11` → `42.7.11` | pin + monitor | Explicit override clearing GHSA-98qh-xjc8-98pq + GHSA-hq9p-pm7w-8p54. Revisit when Spring Boot's BOM moves past 42.7.11, then drop the override to stop fighting the BOM. |
| `io.github.resilience4j:resilience4j-spring-boot3` | `2.3.0` → `2.3.0` | bump now | Already current. No action this cycle; watch 3.x once Spring Boot 4 / Reactor 4 lands. |
| `dnsjava:dnsjava` | `3.6.3` → `3.6.3` | bump now | Already current. Java-21-compatible line used by `BoundedDns` (iters 4, 21). No active CVEs. |
| `com.github.ua-parser:uap-java` | `1.6.1` → `1.6.1` | investigate | Already current head, but the project is quiet (last release Dec 2023). Spike: evaluate replacing jar bumps with `ua_parser/uap-core` JSON refreshes to hedge against abandonment risk. |
| `next` / `react` / `react-dom` | all current | bump now | Pinned in lockstep, all at heads of their respective majors. Keep `eslint-config-next` aligned with `next`. |
| `react-leaflet` / `leaflet` | `^5.0.0` / `1.9.4` | bump now | Both current heads. Ignore Dependabot noise about leaflet 2.x (still alpha). |
| `winston` | `^3.19.0` | bump now | Current head of 3.x. Server-side only; defer 4.x ESM rewrite. |

## Consequences

- **Dependabot grouping:** group by ecosystem and risk band — one PR for Spring Boot patch/minor BOM-managed deps, one for `next` + `react` + `react-dom` + `eslint-config-next` (lockstep), one for test-only deps (`rest-assured`, Jackson test scope). Pre-1.0 libs (`lucide-react`) and known-breaking majors (`tailwind-merge` 3.x, `rest-assured` 6.x, `next-auth` 5.x betas) must each get their own ungrouped PR so they cannot be silently swept in.
- **Required CI gate before merging any dep bump:** full backend `mvn verify` (including `SsrfProtectionIT` and the integration suite that caught the rest-assured 6.0.0 regression on 2026-05-14), frontend `pnpm typecheck` + `pnpm test` + `pnpm build`, and the security workflow (CVE scan + license check). No green CI, no merge — even for "trivial" patch bumps.
- **Major-version bumps:** never auto-merged, never grouped. Every major requires a hand-written spike issue documenting breaking-change surface, callsite audit, rollback plan, and an explicit owner. Dependabot is configured with `ignore: version-update:semver-major` for the deps above marked "pin + monitor"; removing that ignore is itself a reviewed PR.

## References

- `a80e452` — `fix(api/test-deps): pin rest-assured to 5.5.0 (Jackson 2 compatible)` (the fix that ended the 16-day red-CI window)
- `05c3b6d` — `Pin rest-assured to 5.5.0 to restore green CI (Jackson 3 mismatch) (#37)`
- `.github/workflows/ci.yml` — the required-checks workflow that must gate every Dependabot merge (`frontend` + backend `mvn verify` jobs)
- `.github/workflows/security.yml` — CVE scan + license check, also required
