import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rateLimit, __resetForTests } from "@/lib/rate-limit";

describe("rateLimit (token bucket per IP)", () => {
  beforeEach(() => __resetForTests());
  afterEach(() => vi.useRealTimers());

  it("allows the first request from a new IP", () => {
    const r = rateLimit("1.2.3.4", 10);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9);
    expect(r.retryAfterSec).toBe(0);
  });

  it("counts requests within the window", () => {
    for (let i = 0; i < 5; i++) rateLimit("1.2.3.4", 10);
    const r = rateLimit("1.2.3.4", 10);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4); // 6 requests done, 10 - 6 = 4
  });

  it("denies requests above the limit", () => {
    for (let i = 0; i < 10; i++) rateLimit("1.2.3.4", 10);
    const r = rateLimit("1.2.3.4", 10);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("isolates IPs from each other", () => {
    for (let i = 0; i < 10; i++) rateLimit("1.1.1.1", 10);
    const r = rateLimit("2.2.2.2", 10);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9);
  });

  it("resets the bucket once the window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    for (let i = 0; i < 10; i++) rateLimit("9.9.9.9", 10);
    expect(rateLimit("9.9.9.9", 10).allowed).toBe(false);

    // Advance past the 60-second window
    vi.setSystemTime(new Date(2026, 0, 1, 12, 1, 1));
    const r = rateLimit("9.9.9.9", 10);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9);
  });

  it("survives 1 000 distinct IPs hitting once each", () => {
    const limit = 5;
    let allowed = 0;
    for (let i = 0; i < 1000; i++) {
      const r = rateLimit(`10.0.${(i >> 8) & 0xff}.${i & 0xff}`, limit);
      if (r.allowed) allowed++;
    }
    expect(allowed).toBe(1000); // each IP's first request goes through
  });

  it("denies the 1 001st same-IP request out of 1 100 within one window", () => {
    const limit = 1000;
    let allowedCount = 0;
    for (let i = 0; i < 1100; i++) {
      if (rateLimit("5.5.5.5", limit).allowed) allowedCount++;
    }
    expect(allowedCount).toBe(1000);
  });

  it("returns a sane retry-after that decreases over time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    for (let i = 0; i < 10; i++) rateLimit("3.3.3.3", 10);

    const a = rateLimit("3.3.3.3", 10);
    expect(a.retryAfterSec).toBeGreaterThan(50);

    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 30));
    const b = rateLimit("3.3.3.3", 10);
    expect(b.retryAfterSec).toBeLessThan(35);
  });
});
