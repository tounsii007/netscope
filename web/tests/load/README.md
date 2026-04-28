# Load tests (k6)

Six progressively-heavier scenarios. Run from `web/`.

| # | File | VUs | Duration | Use when                                    |
|---|------|----:|----------|---------------------------------------------|
| 1 | `01-smoke.js`            |    10 |  1 min | Every staging deploy — sanity check          |
| 2 | `02-load.js`             |   100 |  5 min | Baseline SLA verification                    |
| 3 | `03-stress-1000.js`      | 1 000 | 10 min | Find the knee, mixed-endpoint workload       |
| 4 | `04-stress-1000-same.js` | 1 000 | 13 min | Cache hot-spot, single-endpoint hammering    |
| 5 | `05-spike-5000.js`       | 5 000 |  4 min | "Hacker News spike" — graceful degradation   |
| 6 | `06-soak-10000.js`       |10 000 | 50 min | Memory leaks, pool exhaustion, log disk      |

## Quick start

```bash
# Local backend on :8080
BASE_URL=http://localhost:3000 k6 run tests/load/01-smoke.js

# Or via the npm shortcuts
npm run test:load:smoke
npm run test:load:stress
```

⚠️  Never set `BASE_URL` to production. The GitHub Actions workflow
explicitly refuses to target `traceronix.io`.

## Reading the summary

Every scenario writes:

- `tests/load/results/summary.txt`  — human-readable
- `tests/load/results/summary.json` — machine-readable, fed into the
  CI artifact uploader

The text summary includes p50/p95/p99 latency, TTFB p95, error rate,
total iterations and throughput.

## Thresholds (CI gate)

Each scenario carries its own `thresholds`. If any fails, k6 exits
with code 99 and the CI job fails. Loosen them only after confirming
the regression is intentional (e.g. you added a new heavy endpoint).
