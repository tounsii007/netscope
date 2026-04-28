/**
 * Client-side Web Vitals reporter.
 *
 * Wires into Next.js' built-in {@code reportWebVitals} hook to capture
 * the Core Web Vitals (LCP, INP, CLS) plus FCP and TTFB, then forwards
 * them to the backend `/api/vitals` route in batched, low-priority
 * `sendBeacon` posts so we never block paint or interaction.
 *
 * Sample shape (one entry per metric):
 * {
 *   name: "LCP", value: 1842, rating: "good",
 *   id: "v3-1730000000000-1234567",
 *   page: "/de/port-checker",
 *   nav: "navigate",
 *   conn: "4g"
 * }
 */

export interface VitalEntry {
  name: "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  id: string;
  page: string;
  nav?: string;
  conn?: string;
}

const ENDPOINT =
  process.env.NEXT_PUBLIC_VITALS_ENDPOINT ?? "/api/vitals";

const queue: VitalEntry[] = [];
let flushScheduled = false;

/**
 * Hand-off entry point — called by Next.js' `reportWebVitals` callback
 * registered in instrumentation-client.ts. Buffers and flushes via
 * `sendBeacon` so visibility changes (tab close) still ship the data.
 */
export function recordVital(metric: {
  name: string;
  value: number;
  id: string;
  rating?: string;
  navigationType?: string;
}) {
  if (!isReportable(metric.name)) return;

  const entry: VitalEntry = {
    name: metric.name as VitalEntry["name"],
    value: round(metric.value),
    rating: (metric.rating as VitalEntry["rating"]) ?? classify(metric.name, metric.value),
    id: metric.id,
    page: typeof window !== "undefined" ? window.location.pathname : "",
    nav: metric.navigationType,
    conn: connectionType(),
  };
  queue.push(entry);
  scheduleFlush();
}

function isReportable(name: string): name is VitalEntry["name"] {
  return name === "LCP" || name === "INP" || name === "CLS"
      || name === "FCP" || name === "TTFB";
}

function classify(name: string, value: number): VitalEntry["rating"] {
  // Web-vitals.js thresholds (March-2024 spec). Used only when the
  // metric library didn't already bucket the value.
  switch (name) {
    case "LCP":  return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
    case "INP":  return value <= 200  ? "good" : value <= 500  ? "needs-improvement" : "poor";
    case "CLS":  return value <= 0.1  ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
    case "FCP":  return value <= 1800 ? "good" : value <= 3000 ? "needs-improvement" : "poor";
    case "TTFB": return value <= 800  ? "good" : value <= 1800 ? "needs-improvement" : "poor";
    default:     return "good";
  }
}

/** Round to 0.001 for CLS and 1 ms otherwise, to keep JSON bodies small. */
function round(v: number): number {
  return Math.abs(v) < 1 ? Math.round(v * 1000) / 1000 : Math.round(v);
}

function connectionType(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const c = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return c?.effectiveType;
}

/**
 * Coalesce calls fired during the same paint into a single beacon. We
 * also flush once on `pagehide` so navigations don't drop the buffer.
 */
function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(flush, 250);

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flushSync, { once: true });
  }
}

function flush() {
  flushScheduled = false;
  if (queue.length === 0) return;
  const body = JSON.stringify({ entries: queue.splice(0, queue.length) });
  send(body);
}

function flushSync() {
  if (queue.length === 0) return;
  send(JSON.stringify({ entries: queue.splice(0, queue.length) }));
}

function send(body: string) {
  if (typeof navigator === "undefined") return;
  // sendBeacon lets the browser ship the request even after page unload
  // and never blocks navigation. Falls back to fetch+keepalive on
  // browsers without Beacon (rare; mobile Safari < 12).
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(ENDPOINT, blob);
    return;
  }
  fetch(ENDPOINT, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => { /* ignore — telemetry is best-effort */ });
}
