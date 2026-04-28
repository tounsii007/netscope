// Spike — sudden 5 000-VU burst, sustained for 2 minutes. Simulates
// the "TechCrunch effect": 50× normal traffic appearing in seconds
// (e.g. when a popular subreddit links to one of the tools).
//
// What we want to verify:
//   • The system degrades gracefully (rate-limit kicks in, returns 429
//     instead of 500).
//   • No cascading failures (Resilience4j circuit breakers open before
//     the database connection pool exhausts).
//   • Error rate stays bounded; CPU + memory don't OOM.
//
// Run:  k6 run tests/load/05-spike-5000.js

import { sleep } from "k6";
import { hitRandomEndpoint, buildSummary, preflightOrAbort } from "./scenarios.js";

export function setup() { preflightOrAbort(); }

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: 50,           // 50 req/s baseline
      timeUnit: "1s",
      preAllocatedVUs: 500,
      maxVUs: 5000,
      stages: [
        { duration: "30s", target: 50    },  // warm-up at baseline
        { duration: "10s", target: 5000  },  // ⚡ instant 100× spike
        { duration: "2m",  target: 5000  },  // sustain
        { duration: "30s", target: 50    },  // recover
        { duration: "30s", target: 50    },  // verify steady state again
      ],
      gracefulStop: "1m",
    },
  },
  // Spike thresholds are intentionally lenient — we PASS as long as
  // the service stays up. Errors above 30 % or 5xx-storm fails it.
  thresholds: {
    http_req_failed: ["rate<0.30"],
    // Health-check assertion: after the spike subsides we expect to
    // recover quickly. This isn't testable in pure k6 thresholds, but
    // the summary report shows it.
  },
};

export default function () {
  hitRandomEndpoint();
  // Tiny think time — under spike conditions VUs are essentially
  // open-loop arrivals, so this is mostly noise.
  sleep(0.02);
}

export function handleSummary(data) { return buildSummary(data); }
