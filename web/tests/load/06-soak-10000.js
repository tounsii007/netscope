// Soak — 1 000 VUs for 30 minutes, then ramped to 10 000 VUs for
// 10 minutes. The "more than 1000 users" requirement, expressed as
// the longest-running scenario in the suite. Catches:
//
//   • Memory leaks that only manifest after sustained load
//   • Connection-pool exhaustion (Postgres, Redis, upstream APIs)
//   • Log-disk fill-up at production volume
//   • Cache eviction storms (Redis 12-h TTLs cycling under load)
//
// Run:  k6 run tests/load/06-soak-10000.js
// Run time: ~50 minutes — only run on dedicated staging.

import { sleep } from "k6";
import { hitRandomEndpoint, buildSummary, preflightOrAbort } from "./scenarios.js";

export function setup() { preflightOrAbort(); }

export const options = {
  scenarios: {
    soak: {
      executor: "ramping-vus",
      startVUs: 100,
      stages: [
        { duration: "2m",  target: 1000  },
        { duration: "30m", target: 1000  },  // long soak at "stress" level
        { duration: "5m",  target: 5000  },  // ramp halfway
        { duration: "5m",  target: 10000 },  // ramp to 10× the stress level
        { duration: "10m", target: 10000 },  // soak at peak
        { duration: "5m",  target: 0     },
      ],
      gracefulStop: "2m",
    },
  },
  thresholds: {
    // Beyond 1000 VUs we accept higher latency, but the system MUST
    // stay responsive (no full lockup) and the error rate is capped.
    http_req_duration: ["p(95)<10000"],
    http_req_failed:   ["rate<0.10"],
    error_rate:        ["rate<0.10"],
  },
};

export default function () {
  hitRandomEndpoint();
  sleep(Math.random() * 0.3);
}

export function handleSummary(data) { return buildSummary(data); }
