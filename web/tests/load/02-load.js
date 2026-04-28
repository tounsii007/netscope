// Load test — 100 VUs for 5 minutes, simulating typical sustained
// traffic. Verifies the SLA holds under realistic, non-bursty load.
//
// Run:  k6 run tests/load/02-load.js
// Env:  BASE_URL

import { sleep } from "k6";
import {
  hitRandomEndpoint, buildSummary, preflightOrAbort, SLA_THRESHOLDS,
} from "./scenarios.js";

export function setup() { preflightOrAbort(); }

export const options = {
  scenarios: {
    typical_load: {
      executor: "ramping-vus",
      startVUs: 10,
      stages: [
        { duration: "30s", target: 50 },   // ramp to half
        { duration: "30s", target: 100 },  // ramp to full
        { duration: "3m",  target: 100 },  // stay there
        { duration: "1m",  target: 0 },    // ramp down
      ],
      gracefulStop: "30s",
    },
  },
  thresholds: SLA_THRESHOLDS,
};

export default function () {
  hitRandomEndpoint();
  sleep(Math.random() * 0.5 + 0.2);
}

export function handleSummary(data) { return buildSummary(data); }
