// Same-endpoint stress — 1 000 VUs all hammering the SAME URL. This
// is the worst case for the result-cache (every miss is a cache fill
// for the same key) and for any per-target rate limiter.
//
// We rotate through three different endpoint kinds in three back-to-back
// scenarios so we see hot-spotting on each one separately:
//   1. /api/v1/port/check       — POST, no cache (expensive)
//   2. /api/v1/dns/google.com   — GET, cacheable
//   3. /api/v1/ip/8.8.8.8       — GET, cacheable + multi-source
//
// Run:  k6 run tests/load/04-stress-1000-same.js

import { sleep } from "k6";
import http from "k6/http";
import { check } from "k6";
import {
  BASE_URL, reqOk, reqFail, errorRate, ttfb, buildSummary, preflightOrAbort,
} from "./scenarios.js";

export function setup() { preflightOrAbort(); }

export const options = {
  scenarios: {
    same_port_check: {
      executor: "ramping-vus", exec: "portCheck",
      startVUs: 50,
      stages: [
        { duration: "30s", target: 500 },
        { duration: "30s", target: 1000 },
        { duration: "3m",  target: 1000 },
        { duration: "30s", target: 0 },
      ],
      startTime: "0s",
      gracefulStop: "30s",
    },
    same_dns: {
      executor: "ramping-vus", exec: "dnsLookup",
      startVUs: 50,
      stages: [
        { duration: "30s", target: 1000 },
        { duration: "3m",  target: 1000 },
        { duration: "30s", target: 0 },
      ],
      startTime: "5m",
      gracefulStop: "30s",
    },
    same_ip: {
      executor: "ramping-vus", exec: "ipLookup",
      startVUs: 50,
      stages: [
        { duration: "30s", target: 1000 },
        { duration: "3m",  target: 1000 },
        { duration: "30s", target: 0 },
      ],
      startTime: "10m",
      gracefulStop: "30s",
    },
  },
  thresholds: {
    "http_req_duration{endpoint:port}": ["p(95)<5000"],   // POST, no cache
    "http_req_duration{endpoint:dns}":  ["p(95)<800"],     // hot cache hit
    "http_req_duration{endpoint:ip}":   ["p(95)<800"],     // hot cache hit
    http_req_failed: ["rate<0.05"],
  },
};

const params = (name) => ({
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  tags: { endpoint: name, scenario: "same-endpoint" },
  timeout: "10s",
});

function record(res, ok) {
  if (ok) reqOk.add(1); else reqFail.add(1);
  errorRate.add(!ok);
  if (res.timings.waiting > 0) ttfb.add(res.timings.waiting);
}

export function portCheck() {
  const res = http.post(
    `${BASE_URL}/api/v1/port/check`,
    JSON.stringify({ target: "google.com", port: 443, protocol: "tcp" }),
    params("port")
  );
  const ok = check(res, { "status ok": (r) => r.status === 200 || r.status === 429 });
  record(res, ok);
  sleep(0.1);
}

export function dnsLookup() {
  const res = http.get(`${BASE_URL}/api/v1/dns/google.com?type=A,AAAA`, params("dns"));
  const ok = check(res, { "status ok": (r) => r.status === 200 || r.status === 429 });
  record(res, ok);
  sleep(0.1);
}

export function ipLookup() {
  const res = http.get(`${BASE_URL}/api/v1/ip/8.8.8.8`, params("ip"));
  const ok = check(res, { "status ok": (r) => r.status === 200 || r.status === 429 });
  record(res, ok);
  sleep(0.1);
}

export function handleSummary(data) { return buildSummary(data); }
