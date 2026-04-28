// Stress — 1 000 concurrent VUs sending mixed requests across all
// public endpoints. The goal is "find the knee of the curve" — the
// VU count at which p95 latency or error-rate budgets break.
//
// Run:  k6 run tests/load/03-stress-1000.js
// Env:  BASE_URL  (REQUIRED — never run this against prod)

import { sleep } from "k6";
import { hitRandomEndpoint, buildSummary } from "./scenarios.js";

export const options = {
  scenarios: {
    stress_mixed: {
      executor: "ramping-vus",
      startVUs: 50,
      // Slow ramp prevents an artificial cold-start spike from masking
      // the steady-state behaviour we're trying to characterise.
      stages: [
        { duration: "1m",  target: 200 },
        { duration: "1m",  target: 500 },
        { duration: "1m",  target: 1000 },  // peak
        { duration: "5m",  target: 1000 },  // soak at peak
        { duration: "2m",  target: 0 },
      ],
      gracefulStop: "1m",
    },
  },
  // Looser budgets here than in load.js — at 1000 VUs we accept some
  // degradation; we just want to know HOW MUCH it degrades.
  thresholds: {
    http_req_duration: ["p(95)<3000", "p(99)<8000"],
    http_req_failed:   ["rate<0.05"],   // ≤ 5 % errors at peak
    error_rate:        ["rate<0.05"],
  },
};

export default function () {
  hitRandomEndpoint();
  // Negligible sleep — we want each VU pushing as hard as the network
  // allows so 1000 VUs really mean ~1000 in-flight requests.
  sleep(0.05 + Math.random() * 0.15);
}

export function handleSummary(data) { return buildSummary(data); }
