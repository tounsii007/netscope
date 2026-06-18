# Contributing to Traceronix / NetScope

Thanks for the interest. This doc captures the working conventions the
codebase already enforces in CI — useful for new contributors so they
don't have to reverse-engineer the patterns from commit history.

## Repo layout

```
api/        Spring Boot 3.5 / Java 21 backend (Maven)
web/        Next.js 16 / React 19 / TypeScript frontend
cli/        Standalone CLI client
sdk/        TypeScript SDK published to npm
deploy/     Docker / compose / infra
docs/       Architecture + API references
.github/    Actions, Dependabot, templates
```

Each slice has its own CI workflow (`web.yml`, `api.yml`) plus a
combined `ci.yml` that runs both on every PR.

## Local quickstart

```bash
# Backend
cd api && mvn -B verify         # compile + tests
# or just the fast compile loop:
mvn -q compile

# Frontend
cd web && npm install
npm run typecheck               # tsc --noEmit
npm run lint                    # next lint
npm test                        # vitest run --coverage
npm run build                   # production build
```

Full integration tests (`api/...IntegrationTest`) need Testcontainers
and a working Docker daemon.

## Branches & PRs

- Default branch: `main`. Direct pushes are blocked; everything goes
  through a PR.
- Branch names are free-form; CI picks them up regardless.
- The PR template (`.github/PULL_REQUEST_TEMPLATE.md`) prompts for:
  summary, type-of-change checkbox, scope, test plan, i18n parity,
  notes for reviewer. Filling it in saves a review round-trip.

## Commit messages

Follow the conventional-commits-ish style the existing log uses:

```
type(scope): one-line summary

Longer body explaining the *why* and any non-obvious *how*. Bullet
lists are welcome.

  • Concrete observation that motivated the change.
  • What got touched and what the new contract is.

Test results, audit findings, follow-ups. Co-author trailer if
generated with an assistant.
```

Common types: `feat`, `fix`, `chore`, `docs`, `test`, `perf`, `sec`,
`a11y`, `i18n`, `refactor`. Scope is the touched slice
(`web/dns-lookup`, `api/docker`, `deploy`, etc.).

## i18n discipline

The frontend ships **11 locales** (en, de, fr, es, it, pl, ru, uk, tr,
hi, zh). Every user-visible string lives in `web/messages/<locale>.json`
under a namespace; components use `useTranslations("<ns>")` or
`getTranslations({namespace})`.

Rules:
- Touch one locale → touch all eleven. PR template has a checkbox.
- Placeholders (`{count}`, `{domain}`) must match across all locales.
- `tests/i18n-bundles.test.ts` enforces key parity in CI — runs free.
- Match the existing form-of-address convention per language (RU/UK/FR
  use informal "ты/tu"; DE/ES/IT/ZH use neutral/formal where applicable).
- Pure technical terms (acronyms, HTTP header names, brand names) stay
  in English even in non-English bundles.

## Security model

- Frontend `lib/target-guard.ts` and backend `TargetValidator` /
  `IpAddressGuard` ALL agree on the block categories
  (loopback / RFC 1918 / link-local / ULA / CGNAT / cloud metadata /
  multicast / reserved). Changing one without the others is a bug —
  the FE guard is documented as defense-in-depth.
- IP encoding bypasses (decimal, hex, short-form, full-form IPv6) are
  handled in both `target-guard.ts::parseIpv4` and `TargetValidator`.
  The adversarial test suites (`target-guard-adversarial.test.ts`,
  `TargetValidatorSsrfTest.java`) lock the behaviour.
- CSP enforcement happens in two layers:
  1. `web/middleware.ts` sets a per-request CSP that uses
     `nonce-<value>` for script-src and style-src — no `'unsafe-inline'`
     in production. Every HTML route goes through this path.
  2. `web/next.config.ts` carries a fallback CSP for static-asset
     routes that bypass the middleware matcher; this fallback still
     allows `'unsafe-inline'` since no user-controlled data is
     rendered on that path.
  When adding a new inline `<script>` or inline `<style>` to a
  layout/page: read the nonce via `headers().get('x-nonce')` and
  pass `nonce={n}` to the tag. Anything Next.js's own bootstrap
  injects already inherits the nonce automatically via the response
  header — no manual threading needed.

## Test coverage gates

Both vitest and JaCoCo have minimum coverage thresholds. The web
vitest gate is global lines/statements ≥ 45 %, plus per-file gates on
the security-critical modules (`lib/target-guard.ts`, `lib/rate-limit.ts`,
`lib/normalise-host.ts`) at ≥ 90 %. CI fails the build if a PR
drops below.

## Adding a new tool

1. Add the page directory under `web/app/[locale]/<slug>/page.tsx`.
2. Add the matching entry under `tools.<slug>` in every locale file
   (`title`, `desc`, `meta_title`, `meta_description`, `explainer.*`).
3. Add the route + icon to the `toolKeys` array in
   `web/app/[locale]/page.tsx`.
4. Add the backend controller/service under `api/src/main/java/io/netscope/<slug>`.
5. Tests:
   - frontend smoke test in `web/tests/smoke-tool-clients.test.tsx`
   - backend unit + integration tests
   - if it accepts a user-provided target, add adversarial-SSRF
     coverage to both `target-guard-adversarial.test.ts` and
     `TargetValidatorSsrfTest.java`.

## Dependency pinning

A few dependencies are pinned to **exact** versions (no caret prefix)
because they ship pre-1.0 or rely on prerelease tags where a patch bump
can carry breaking changes:

- `next-auth` — pinned at `5.0.0-beta.31`. The 5.x line is still in
  beta; later betas have re-shaped the `Session` callback signature.
  Upgrade plan: move to `5.0.0` GA in a single dedicated PR and
  re-validate the session-cookie + provider wiring against the live
  Stripe-billing flow at the same time.

Everything else uses `^minor.patch` and is allowed to float.

## Reporting security issues

Do NOT open public GitHub issues for vulnerabilities. Email security@
or open a private security advisory on GitHub. We aim to acknowledge
within two business days.
