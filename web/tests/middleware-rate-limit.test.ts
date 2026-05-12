import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression test for the bug where middleware called `rateLimit(ip)`
 * twice per request — once to decide allowed/denied and a second time
 * just to read the remaining count for response headers.
 *
 * Because `rateLimit` *increments* the bucket, each successful request
 * was costing two slots, effectively halving the configured budget.
 *
 * The fix is to call once and reuse the result for both the 429 path
 * and the trailing X-RateLimit-* headers. This test mocks the limiter
 * and asserts the call count.
 */

const calls: Array<{ ip: string; limit: number | undefined }> = [];

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (ip: string, limit?: number) => {
    calls.push({ ip, limit });
    return {
      allowed: true,
      remaining: 99,
      resetMs: Date.now() + 60_000,
      retryAfterSec: 0,
    };
  },
  currentLimit: () => 100,
}));

vi.mock("next-intl/middleware", () => ({
  default: () => () => {
    const { NextResponse } = require("next/server");
    return NextResponse.next();
  },
}));

vi.mock("@/i18n/routing", () => ({ routing: { locales: ["en"], defaultLocale: "en" } }));

describe("middleware — rateLimit single-call invariant", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("calls rateLimit exactly once for a non-vitals request", async () => {
    const { default: middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");
    // Use cf-connecting-ip — added by Cloudflare and not spoofable
    // from outside. The middleware now prefers it over raw XFF.
    const req = new NextRequest("https://example.test/en/dns-lookup", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });

    middleware(req);

    expect(calls.length).toBe(1);
    expect(calls[0].ip).toBe("1.2.3.4");
  });

  it("ignores raw x-forwarded-for (spoofable) by default", async () => {
    // Adversarial test: ensure setting only x-forwarded-for does NOT
    // change the rate-limit bucket key. The previous implementation
    // would happily bucket each random XFF value separately, letting
    // an attacker bypass the limit. We expect "unknown" — every
    // request falls into the shared anonymous bucket.
    const { default: middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("https://example.test/en/dns-lookup", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    middleware(req);

    expect(calls.length).toBe(1);
    expect(calls[0].ip).toBe("unknown");
  });

  it("skips rateLimit entirely for /api/vitals", async () => {
    const { default: middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("https://example.test/api/vitals", {
      method: "POST",
      headers: { "x-forwarded-for": "5.6.7.8" },
    });

    middleware(req);

    expect(calls.length).toBe(0);
  });

  it("skips rateLimit entirely for /api/log", async () => {
    // The error-boundary endpoint must remain reachable even when the
    // caller's bucket is exhausted — otherwise a buggy page that
    // generates an error storm gets 429'd at the worst possible moment.
    // /api/log enforces its own 16 KB body cap so the exemption doesn't
    // turn it into a DoS vector.
    const { default: middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("https://example.test/api/log", {
      method: "POST",
      headers: { "x-forwarded-for": "9.10.11.12" },
    });

    middleware(req);

    expect(calls.length).toBe(0);
  });
});
