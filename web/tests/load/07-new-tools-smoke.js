// Targeted smoke test for the four tools added in the 29-tools sprint
// (DKIM, CT-logs, DoH, WebSocket). Lower VU count + tighter latency
// budgets because these endpoints carry more upstream variability than
// the established ones — failing the smoke test means a clear
// regression in the new path, not noisy cross-tool interactions.
//
// Run: k6 run tests/load/07-new-tools-smoke.js
// Env: BASE_URL (default http://localhost:3000)

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, buildSummary, preflightOrAbort } from "./scenarios.js";

export const options = {
  scenarios: {
    new_tools_smoke: {
      executor: "constant-vus",
      vus: 10,
      duration: "1m",
      gracefulStop: "10s",
    },
  },
  // Tighter than the global SLA — these tools have well-known upstream
  // bounds (BoundedDns 3s cap, crt.sh 15s ceiling, DoH 8s budget).
  // p95 above 4s on the new endpoints is a real regression.
  thresholds: {
    "http_req_duration{name:/api/v1/dkim/:domain}":    ["p(95)<4000"],
    "http_req_duration{name:/api/v1/doh/:domain}":     ["p(95)<8000"],
    "http_req_duration{name:/api/v1/ct-logs/:domain}": ["p(95)<15000"],
    "http_req_duration{name:/api/v1/websocket}":       ["p(95)<8000"],
    "http_req_failed":                                  ["rate<0.10"], // upstream-flakiness tolerance
  },
};

export function setup() { preflightOrAbort(); }

// Realistic test domains for the new tools. DKIM and DoH need
// well-known senders / resolvers; CT-logs needs a popular root domain
// that genuinely has CT entries.
const DKIM_DOMAINS = ["google.com", "github.com", "microsoft.com"];
const DNS_DOMAINS  = ["cloudflare.com", "google.com", "github.com"];
const CT_DOMAINS   = ["github.com", "cloudflare.com"];
const WS_TARGETS   = [
  "wss://echo.websocket.events",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export default function () {
  const probe = Math.floor(Math.random() * 4);
  let res;
  switch (probe) {
    case 0:
      res = http.get(`${BASE_URL}/api/v1/dkim/${pick(DKIM_DOMAINS)}`, {
        tags: { name: "/api/v1/dkim/:domain", endpoint: "dkim" },
        timeout: "10s",
      });
      break;
    case 1:
      res = http.get(`${BASE_URL}/api/v1/doh/${pick(DNS_DOMAINS)}?type=A`, {
        tags: { name: "/api/v1/doh/:domain", endpoint: "doh" },
        timeout: "12s",
      });
      break;
    case 2:
      res = http.get(
        `${BASE_URL}/api/v1/ct-logs/${pick(CT_DOMAINS)}?includeSubdomains=false`,
        {
          tags: { name: "/api/v1/ct-logs/:domain", endpoint: "ctlogs" },
          timeout: "20s",
        }
      );
      break;
    default:
      res = http.get(
        `${BASE_URL}/api/v1/websocket?url=${encodeURIComponent(pick(WS_TARGETS))}`,
        {
          tags: { name: "/api/v1/websocket", endpoint: "websocket" },
          timeout: "12s",
        }
      );
      break;
  }
  check(res, {
    "status is 2xx or expected 4xx": (r) =>
      (r.status >= 200 && r.status < 300) || r.status === 404 || r.status === 429,
  });
  // Generous think time — these tools are user-clicked, not bot-scraped,
  // so a sustained 100 QPS doesn't reflect real usage.
  sleep(Math.random() * 1.5 + 0.5);
}

export function handleSummary(data) { return buildSummary(data); }
