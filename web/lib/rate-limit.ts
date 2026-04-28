/**
 * Frontend rate limiter for Next.js middleware.
 *
 * This is a fallback / first line of defense — the real production
 * rate limiter lives in the Spring Boot backend (Bucket4j + Redis).
 * What we want here is to cheaply 429 abusive clients before they
 * reach the upstream and burn its quota.
 *
 * Strategy: token bucket per IP, kept in-memory.
 *   - default: 120 req/min/IP (env: RATE_LIMIT_PER_MIN)
 *   - 60-second sliding window
 *   - automatic GC of stale buckets so memory stays bounded
 *
 * Limitations:
 *   - In-memory only. Multi-instance deploys (Vercel, k8s) need a
 *     shared store (Redis). For single-instance Node the in-memory
 *     map is good for ~50 k unique IPs/hour.
 *   - Edge runtime won't see the same map across regions; use
 *     `runtime: 'nodejs'` in middleware if multi-region accuracy
 *     matters more than latency.
 */

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 50_000;          // hard cap — protects against memory blow-up
const GC_EVERY_MS = 60_000;
const DEFAULT_LIMIT = 120;

interface Bucket {
  /** Number of requests recorded in the current window. */
  count: number;
  /** Unix-ms when the current window started; expires at +WINDOW_MS. */
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
let lastGc = 0;

/** Per-second hot path. Returns the decision plus headers to surface to clients. */
export function rateLimit(ip: string, limit = currentLimit()): {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterSec: number;
} {
  maybeGc();

  const now = Date.now();
  let b = buckets.get(ip);

  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { count: 1, windowStart: now };
    if (buckets.size < MAX_BUCKETS) buckets.set(ip, b);
    return {
      allowed: true,
      remaining: limit - 1,
      resetMs: now + WINDOW_MS,
      retryAfterSec: 0,
    };
  }

  b.count += 1;
  const remaining = Math.max(0, limit - b.count);
  const resetMs = b.windowStart + WINDOW_MS;
  const retryAfterSec = Math.max(1, Math.ceil((resetMs - now) / 1000));
  return {
    allowed: b.count <= limit,
    remaining,
    resetMs,
    retryAfterSec,
  };
}

/**
 * Garbage-collect expired buckets at most once a minute. Cheap to
 * skip when called in rapid succession; never blocks longer than the
 * map iteration takes (≤ MAX_BUCKETS entries).
 */
function maybeGc() {
  const now = Date.now();
  if (now - lastGc < GC_EVERY_MS) return;
  lastGc = now;
  for (const [ip, b] of buckets) {
    if (now - b.windowStart >= WINDOW_MS) buckets.delete(ip);
  }
}

function currentLimit(): number {
  const env = process.env.RATE_LIMIT_PER_MIN;
  if (!env) return DEFAULT_LIMIT;
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
}

/** Test helper — wipe all buckets between tests. Not exported via index. */
export function __resetForTests() {
  buckets.clear();
  lastGc = 0;
}
