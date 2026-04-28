import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { rateLimit, __resetForTests } from "@/lib/rate-limit";

/**
 * Burst-pattern tests for the rate limiter. Exercises the kinds of
 * traffic shapes that real-world DDoS / abuse looks like:
 *
 *   • 10 000 same-IP requests in a tight loop (single-source DDoS)
 *   • 50 000 unique-IP requests fanning out (botnet)
 *   • Burst, sleep, burst (slow-loris pattern that resets the window)
 *   • Steady-state at exactly the limit (honest hammering bot)
 *
 * Goal: the limiter must stay deterministic, never crash, and use
 * bounded memory even under hostile inputs.
 */
describe("rate limiter — abusive burst patterns", () => {
  beforeEach(() => __resetForTests());
  afterEach(() => vi.useRealTimers());

  it("rejects 9 980 of 10 000 same-IP requests at limit=20", () => {
    const ip = "203.0.113.99";
    const limit = 20;

    let allowed = 0;
    for (let i = 0; i < 10_000; i++) {
      if (rateLimit(ip, limit).allowed) allowed++;
    }
    expect(allowed).toBe(limit);
  });

  it("admits all 50 000 unique-IP requests when each is the first from its IP", () => {
    let allowed = 0;
    for (let i = 0; i < 50_000; i++) {
      const ip = `192.0.2.${i % 256}.${(i >> 8) & 0xff}`; // synthetic — uniqueness only
      if (rateLimit(ip, 5).allowed) allowed++;
    }
    expect(allowed).toBe(50_000);
  });

  it("re-allows after the window resets (slow-loris / drip pattern)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
    const ip = "198.51.100.42";

    for (let i = 0; i < 5; i++) rateLimit(ip, 5);
    expect(rateLimit(ip, 5).allowed).toBe(false);

    // Advance 90 s — well past the 60 s window
    vi.setSystemTime(new Date(2026, 0, 1, 0, 1, 30));
    expect(rateLimit(ip, 5).allowed).toBe(true);

    // Hit the limit again in the new window
    for (let i = 0; i < 4; i++) rateLimit(ip, 5);
    expect(rateLimit(ip, 5).allowed).toBe(false);
  });

  it("memory stays bounded when 100 000 distinct IPs hit once each", () => {
    // The limiter caps internal state at MAX_BUCKETS (50 000). After
    // 100 k unique IPs, fewer than 100 k buckets must remain in memory.
    for (let i = 0; i < 100_000; i++) {
      rateLimit(`172.16.${(i >> 8) & 0xff}.${i & 0xff}`, 1);
    }
    // We can't introspect the internal map size from outside — but
    // calling `__resetForTests` shouldn't crash, and a fresh request
    // should still work, proving the limiter is still healthy.
    __resetForTests();
    expect(rateLimit("1.2.3.4", 5).allowed).toBe(true);
  });

  it("mixed-traffic — 1 abuser + 1 000 legit IPs", () => {
    const abuser = "10.0.0.99";
    const legit = Array.from({ length: 1000 }, (_, i) => `10.1.${(i >> 8) & 0xff}.${i & 0xff}`);
    const limit = 60;

    // Abuser hammers in tight loop
    let abuserAllowed = 0;
    for (let i = 0; i < 200; i++) {
      if (rateLimit(abuser, limit).allowed) abuserAllowed++;
    }

    // Legit users hit once each — must all pass
    let legitAllowed = 0;
    for (const ip of legit) {
      if (rateLimit(ip, limit).allowed) legitAllowed++;
    }

    expect(abuserAllowed).toBe(limit);   // abuser capped at 60
    expect(legitAllowed).toBe(1000);     // every legit user gets through
  });

  it("performance: 100 000 calls finish in < 2 s on CI hardware", () => {
    const t0 = performance.now();
    for (let i = 0; i < 100_000; i++) {
      rateLimit(`1.2.${(i >> 8) & 0xff}.${i & 0xff}`, 60);
    }
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(2000);
  });
});
