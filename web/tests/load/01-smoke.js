// Smoke test — 10 VUs for 1 minute. Validates basic reachability,
// catches outages early, and runs cheaply on every staging deploy.
//
// Run:  k6 run tests/load/01-smoke.js
// Env:  BASE_URL  (default http://localhost:3000)

import { sleep } from "k6";
import {
  hitRandomEndpoint, buildSummary, preflightOrAbort, SLA_THRESHOLDS,
} from "./scenarios.js";

// Bail loudly with a useful error if BASE_URL isn't reachable instead
// of running for a minute and producing 100 % connection-refused noise.
export function setup() { preflightOrAbort(); }

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: 10,
      duration: "1m",
      gracefulStop: "30s",
    },
  },
  thresholds: SLA_THRESHOLDS,
};

export default function () {
  hitRandomEndpoint();
  // Throttle each VU so we don't hammer at full throttle — smoke is
  // for "does it work at all", not "what's the ceiling".
  sleep(Math.random() * 1.5 + 0.5);
}

export function handleSummary(data) { return buildSummary(data); }
