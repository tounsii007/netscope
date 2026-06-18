// Shared building blocks for every k6 scenario in this folder.
// Splitting the endpoint mix and the result thresholds out here keeps
// the per-scenario files focused on the load shape (VU count + ramp +
// duration) rather than which URLs to hit.

import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// ─── Custom metrics surfaced in the summary report ──────────────────
export const reqOk    = new Counter("requests_ok");
export const reqFail  = new Counter("requests_fail");
export const errorRate = new Rate("error_rate");
export const ttfb     = new Trend("ttfb_ms");

// Performance budget mirrored from README. CI fails any scenario that
// breaches them so a regression in latency or error rate doesn't slip
// through review.
export const SLA_THRESHOLDS = {
  http_req_duration: ["p(95)<1200", "p(99)<3000"], // ms
  http_req_failed:   ["rate<0.01"],                 // < 1 % errors
  error_rate:        ["rate<0.01"],
  ttfb_ms:           ["p(95)<600"],
};

// Mix of public diagnostic endpoints. Probabilities reflect what we
// expect real traffic to look like — port-check and IP-lookup are the
// two most-used tools. Subdomain enumeration is rarer because it's
// expensive on the upstream CT log.
//
// IMPORTANT — every entry sets a stable `nameTag` because k6 normally
// uses the full URL as a metric tag, which would create one time-series
// per unique random IP (millions of them under stress). The reserved
// `name` tag collapses every variant into a single endpoint key in the
// metrics store, keeping cardinality flat.
const ENDPOINT_MIX = [
  { weight: 25, name: "ip",          nameTag: "/api/v1/ip/:ip",
    path: () => `/api/v1/ip/${randIp()}`, method: "GET" },
  { weight: 20, name: "port",        nameTag: "/api/v1/port/check",
    path: () => `/api/v1/port/check`, method: "POST",
    body: () => JSON.stringify({ target: pick(HOSTS), port: pick(PORTS), protocol: "tcp" }) },
  { weight: 15, name: "dns",         nameTag: "/api/v1/dns/:domain",
    path: () => `/api/v1/dns/${pick(DOMAINS)}?type=A,AAAA,MX`, method: "GET" },
  { weight: 10, name: "ssl",         nameTag: "/api/v1/ssl/:host",
    path: () => `/api/v1/ssl/${pick(DOMAINS)}?port=443`, method: "GET" },
  { weight:  8, name: "headers",     nameTag: "/api/v1/headers",
    path: () => `/api/v1/headers?url=${encodeURIComponent("https://" + pick(DOMAINS))}`, method: "GET" },
  { weight:  7, name: "whois",       nameTag: "/api/v1/whois/:domain",
    path: () => `/api/v1/whois/${pick(DOMAINS)}`, method: "GET" },
  { weight:  5, name: "blacklist",   nameTag: "/api/v1/blacklist/:ip",
    path: () => `/api/v1/blacklist/${randIp()}`, method: "GET" },
  { weight:  5, name: "propagation", nameTag: "/api/v1/dns-propagation/:domain",
    path: () => `/api/v1/dns-propagation/${pick(DOMAINS)}?type=A`, method: "GET" },
  { weight:  3, name: "subdomains",  nameTag: "/api/v1/subdomains/:domain",
    path: () => `/api/v1/subdomains/${pick(DOMAINS)}`, method: "GET" },
  { weight:  2, name: "bgp",         nameTag: "/api/v1/bgp/ip/:ip",
    path: () => `/api/v1/bgp/ip/${randIp()}`, method: "GET" },
  // ─── Tools added in the 29-tools sprint ──────────────────────────
  // Lower weights than the established tools — these endpoints either
  // hit external services (crt.sh, public DoH providers) that we don't
  // want to flood under stress, or have their own internal probe pools
  // (DKIM parallel) whose pool sizes matter more than raw QPS.
  { weight:  3, name: "dkim",        nameTag: "/api/v1/dkim/:domain",
    path: () => `/api/v1/dkim/${pick(DOMAINS)}`, method: "GET" },
  { weight:  2, name: "doh",         nameTag: "/api/v1/doh/:domain",
    path: () => `/api/v1/doh/${pick(DOMAINS)}?type=A`, method: "GET" },
  { weight:  2, name: "ctlogs",      nameTag: "/api/v1/ct-logs/:domain",
    // crt.sh is the slowest upstream we have — keep includeSubdomains
    // false in load tests so we don't unintentionally DoS them.
    path: () => `/api/v1/ct-logs/${pick(DOMAINS)}?includeSubdomains=false`, method: "GET" },
];

const HOSTS   = ["google.com", "cloudflare.com", "github.com", "amazon.com", "wikipedia.org", "stackoverflow.com"];
const DOMAINS = ["google.com", "cloudflare.com", "github.com", "example.com", "wikipedia.org", "anthropic.com"];
const PORTS   = [22, 80, 443, 3306, 5432, 6379, 8080, 8443];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randIp() {
  // Use a /8 range we don't actually scan. Public APIs that look up
  // 1.0.0.0/8 (CloudFlare) or 8.0.0.0/8 (Level3) cope fine and
  // exercise the cache nicely.
  const ranges = [1, 8, 9, 100, 142, 198, 208];
  return `${pick(ranges)}.${rnd255()}.${rnd255()}.${rnd255()}`;
}
function rnd255() { return Math.floor(Math.random() * 256); }

// Pre-build a flat selection table once so we don't recompute weights
// on every iteration (millions of iterations × 1000 VUs adds up).
const FLAT = [];
for (const e of ENDPOINT_MIX) {
  for (let i = 0; i < e.weight; i++) FLAT.push(e);
}

/** Send one weighted-random request; record metrics; assert basic OK. */
export function hitRandomEndpoint() {
  const ep = FLAT[Math.floor(Math.random() * FLAT.length)];
  const url = `${BASE_URL}${ep.path()}`;
  const params = {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    // k6's reserved `name` tag — collapses every variant of the same
    // endpoint into one row in the summary, regardless of how many
    // unique URLs we hit. Without this, random-IP paths would create
    // millions of unique time-series and OOM the metrics engine.
    tags: { name: ep.nameTag, endpoint: ep.name },
    timeout: "10s",
  };
  const res = ep.method === "POST"
    ? http.post(url, ep.body ? ep.body() : "{}", params)
    : http.get(url, params);

  const ok = check(res, {
    "status is 2xx or expected 4xx": (r) =>
      (r.status >= 200 && r.status < 300) || r.status === 404 || r.status === 429,
  });
  if (ok) reqOk.add(1); else reqFail.add(1);
  errorRate.add(!ok);
  if (res.timings.waiting > 0) ttfb.add(res.timings.waiting);
  return res;
}

/** Hit one specific endpoint by name — used by the "same endpoint" stress run. */
export function hitNamed(name) {
  const ep = ENDPOINT_MIX.find((e) => e.name === name);
  if (!ep) throw new Error(`unknown endpoint: ${name}`);
  const url = `${BASE_URL}${ep.path()}`;
  const params = {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    tags: { name: ep.nameTag, endpoint: ep.name, scenario: "same-endpoint" },
    timeout: "10s",
  };
  const res = ep.method === "POST"
    ? http.post(url, ep.body ? ep.body() : "{}", params)
    : http.get(url, params);

  const ok = check(res, {
    "status is 2xx or expected 4xx": (r) =>
      (r.status >= 200 && r.status < 300) || r.status === 404 || r.status === 429,
  });
  if (ok) reqOk.add(1); else reqFail.add(1);
  errorRate.add(!ok);
  if (res.timings.waiting > 0) ttfb.add(res.timings.waiting);
  return res;
}

/**
 * Pre-flight reachability check. Run from k6 setup() so the whole
 * scenario aborts cleanly if BASE_URL isn't reachable instead of
 * burning 10 minutes producing 100 % connection-refused noise.
 *
 * Detects three common mistakes:
 *   • dev server not running                  (ECONNREFUSED)
 *   • wrong host in Docker (need host.docker.internal, not localhost)
 *   • DNS typo in BASE_URL                    (ENOTFOUND)
 */
export function preflightOrAbort() {
  const probe = http.get(`${BASE_URL}/api/v1/ip/me`, {
    timeout: "5s",
    tags: { name: "preflight" },
  });
  if (probe.error_code) {
    throw new Error(
      `\n  Preflight to ${BASE_URL} failed: ${probe.error || probe.error_code}\n` +
      `  → Is the dev server running?  Run \`npm run dev\` (or your prod stack).\n` +
      `  → On Docker, BASE_URL must be http://host.docker.internal:3000, not localhost.\n` +
      `  → Override per-run with:  BASE_URL=https://staging.example.com k6 run …\n`
    );
  }
  if (probe.status >= 500) {
    throw new Error(
      `\n  Preflight got HTTP ${probe.status} from ${BASE_URL}.\n` +
      `  Backend is reachable but unhealthy — fix that first.\n`
    );
  }
}

/** Pretty summary saved as both JSON and a human-readable text report. */
export function buildSummary(data) {
  return {
    "tests/load/results/summary.json": JSON.stringify(data, null, 2),
    "tests/load/results/summary.txt": textSummary(data),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const fmt = (n, dp = 0) => (n == null ? "—" : Number(n).toFixed(dp));
  const ok = m.requests_ok?.values?.count ?? 0;
  const fail = m.requests_fail?.values?.count ?? 0;
  const total = ok + fail;
  const errPct = total ? ((fail / total) * 100).toFixed(2) : "0.00";
  const dur = m.http_req_duration?.values || {};
  const ttfbV = m.ttfb_ms?.values || {};
  const lines = [
    "═══════════════════════════════════════════════════════════════",
    "  Traceronix · k6 load test summary",
    "═══════════════════════════════════════════════════════════════",
    `Total requests : ${total.toLocaleString()}`,
    `Successful     : ${ok.toLocaleString()}`,
    `Failed         : ${fail.toLocaleString()}  (${errPct}% error rate)`,
    "",
    "Latency (HTTP request total)",
    `  p50 : ${fmt(dur["p(50)"], 1)} ms`,
    `  p95 : ${fmt(dur["p(95)"], 1)} ms   (budget: ≤ 1200)`,
    `  p99 : ${fmt(dur["p(99)"], 1)} ms   (budget: ≤ 3000)`,
    `  max : ${fmt(dur.max, 1)} ms`,
    "",
    "TTFB (server processing only)",
    `  p95 : ${fmt(ttfbV["p(95)"], 1)} ms   (budget: ≤ 600)`,
    "",
    `Iterations / s : ${fmt(m.iterations?.values?.rate, 1)}`,
    "═══════════════════════════════════════════════════════════════",
  ];
  return lines.join("\n");
}
