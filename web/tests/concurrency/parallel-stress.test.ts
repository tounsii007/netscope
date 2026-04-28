import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, __resetForTests } from "@/lib/rate-limit";
import { suggestTool } from "@/lib/not-found/suggest-tool";
import { decode, SAMPLE_JWT } from "@/app/[locale]/jwt/jwt-decode";
import { levenshtein } from "@/lib/not-found/levenshtein";

/**
 * Concurrency / parallel-stress tests for the pure helpers that run on
 * EVERY request (rate-limiter, fuzzy matcher, JWT decoder). They don't
 * exercise real network, but they verify that:
 *
 *   • The helpers stay correct under heavy concurrent invocation.
 *   • Internal state (rate-limit bucket map) doesn't corrupt under
 *     racing callers.
 *   • No call slows down catastrophically as N grows.
 *
 * Real backend load testing lives in tests/load/*.js (k6).
 */
describe("parallel stress — pure helpers", () => {
  beforeEach(() => __resetForTests());

  // ──────────────────────────────────────────────────────────────────
  it("rateLimit handles 1 000 distinct IPs in parallel correctly", async () => {
    const ips = Array.from({ length: 1000 }, (_, i) =>
      `10.${(i >> 16) & 0xff}.${(i >> 8) & 0xff}.${i & 0xff}`);

    const results = await Promise.all(
      ips.map((ip) => Promise.resolve(rateLimit(ip, 10)))
    );

    // Each unique IP's first request must be allowed.
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(results.every((r) => r.remaining === 9)).toBe(true);
  });

  it("rateLimit denies excess requests when 1 000 callers hit ONE IP", async () => {
    const limit = 100;
    const calls = Array.from({ length: 1000 }, () =>
      Promise.resolve(rateLimit("203.0.113.1", limit))
    );
    const results = await Promise.all(calls);

    const allowed = results.filter((r) => r.allowed).length;
    const denied = results.length - allowed;

    // First `limit` calls allowed, rest denied. Microtask-scheduled
    // Promise.all has no actual concurrency here in V8, so the count
    // is deterministic — but the test guards against future regressions
    // when we add async work inside the limiter.
    expect(allowed).toBe(limit);
    expect(denied).toBe(limit * 9);
  });

  it("rateLimit holds up under 5 000 callers on 100 IPs (mixed pattern)", async () => {
    const limit = 50;
    const ips = Array.from({ length: 100 }, (_, i) => `198.51.100.${i}`);
    const calls = Array.from({ length: 5000 }, (_, i) =>
      Promise.resolve(rateLimit(ips[i % ips.length], limit))
    );
    const results = await Promise.all(calls);

    // Each IP receives 50 calls before hitting the limit.
    const perIp = new Map<string, number>();
    for (let i = 0; i < results.length; i++) {
      const ip = ips[i % ips.length];
      if (results[i].allowed) perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    }
    for (const ip of ips) {
      expect(perIp.get(ip)).toBe(limit);
    }
  });

  // ──────────────────────────────────────────────────────────────────
  it("suggestTool stays correct under 1 000 concurrent fuzzy lookups", async () => {
    const queries = [
      "ip-lookup", "port-checker", "dns-loop", "dnssecc", "jwts",
      "ip-lookupjsdoijsfukfu", "totally-unrelated-thing", "ssll-check",
      "subdomian-finder", "blacklist",
    ];
    const calls = Array.from({ length: 1000 }, (_, i) =>
      Promise.resolve(suggestTool(queries[i % queries.length]))
    );
    const results = await Promise.all(calls);

    // Group by query → all results for the same query must agree.
    const byQuery = new Map<string, Set<string | null>>();
    for (let i = 0; i < results.length; i++) {
      const q = queries[i % queries.length];
      if (!byQuery.has(q)) byQuery.set(q, new Set());
      byQuery.get(q)!.add(results[i]?.href ?? null);
    }
    for (const set of byQuery.values()) {
      expect(set.size).toBe(1); // determinism: one query → one answer
    }
  });

  // ──────────────────────────────────────────────────────────────────
  it("decode() processes 5 000 JWTs in under 2 s", async () => {
    const t0 = performance.now();
    const calls = Array.from({ length: 5000 }, () =>
      Promise.resolve(decode(SAMPLE_JWT))
    );
    const results = await Promise.all(calls);
    const ms = performance.now() - t0;

    expect(results.every((r) => r !== null)).toBe(true);
    expect(ms).toBeLessThan(2000);
  });

  it("decode() doesn't fall apart on a 1 MB header (DoS guard)", () => {
    const huge = "a".repeat(1_000_000);
    expect(() => decode(`${huge}.b.c`)).not.toThrow();
  });

  // ──────────────────────────────────────────────────────────────────
  it("levenshtein handles 10 000 short comparisons in < 250 ms", () => {
    const t0 = performance.now();
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      sum += levenshtein("port-checker", "port-cheker");
    }
    const ms = performance.now() - t0;
    expect(sum).toBe(10000); // deterministic correctness check
    expect(ms).toBeLessThan(250);
  });

  it("levenshtein scales for typical 30-char tool slugs (1 000 × ≤ 50 ms)", () => {
    const a = "ip-lookupjsdoijsfukfu-totally-unrelated";
    const b = "ip-lookup";
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) levenshtein(a, b);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(50);
  });
});
