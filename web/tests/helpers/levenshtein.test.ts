import { describe, it, expect } from "vitest";
import { levenshtein } from "@/lib/not-found/levenshtein";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("ip-lookup", "ip-lookup")).toBe(0);
  });

  it("returns the longer string's length when one side is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("ip-lookup", "")).toBe(9);
  });

  it("counts a single substitution as 1", () => {
    expect(levenshtein("kitten", "sitten")).toBe(1);
    expect(levenshtein("a", "b")).toBe(1);
  });

  it("counts a single insertion as 1", () => {
    expect(levenshtein("ab", "abc")).toBe(1);
    expect(levenshtein("ip-lookup", "ip-lookups")).toBe(1);
  });

  it("counts a single deletion as 1", () => {
    expect(levenshtein("abc", "ab")).toBe(1);
    expect(levenshtein("port-checker", "port-cheker")).toBe(1);
  });

  it("matches the canonical kitten/sitting example", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("is symmetric", () => {
    const pairs: [string, string][] = [
      ["abc", "xyz"],
      ["port-checker", "ip-lookup"],
      ["dns", "dnssec"],
    ];
    for (const [a, b] of pairs) {
      expect(levenshtein(a, b)).toBe(levenshtein(b, a));
    }
  });

  it("handles realistic typo-fixing cases for our tool slugs", () => {
    expect(levenshtein("ip-lookupjsdoijsfukfu", "ip-lookup")).toBe(12);
    expect(levenshtein("port-checkr", "port-checker")).toBe(1);
    expect(levenshtein("dns-popgation", "dns-propagation")).toBeLessThanOrEqual(3);
  });

  it("survives unicode characters without crashing", () => {
    expect(levenshtein("café", "cafe")).toBe(1);
    expect(levenshtein("über", "uber")).toBe(1);
  });

  it("is fast enough for hot paths (sub-200 ms for 1 000 × 30-char inputs)", () => {
    const a = "a".repeat(30);
    const b = "b".repeat(30);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) levenshtein(a, b);
    const ms = performance.now() - t0;
    // The original 50 ms budget was set on a fast dev box; CI hardware
    // and JIT warm-up made it flaky (often 60-120 ms on shared Windows
    // runners). 200 ms still detects an algorithmic regression — the
    // pure-JS implementation runs in ≤ 30 ms locally — without tripping
    // on every cold-cache or shared-CPU run.
    expect(ms).toBeLessThan(200);
  });
});
