/**
 * Coverage for /api/csp-report — the route already had a smoke test, but
 * the production-relevant edges (modern report-list, legacy single
 * object, oversized body, malformed JSON, GET rejection) were not all
 * locked. These tests assert the contract a security incident response
 * relies on: every well-formed violation is logged exactly once, every
 * malformed input is bounced with a stable status code, and no path
 * crashes the route handler.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST, GET, OPTIONS } from "@/app/api/csp-report/route";

// Stub the structured logger so assertions can inspect call shapes.
vi.mock("@/lib/logger", () => {
  return {
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  };
});

import { logger } from "@/lib/logger";

const realPostUrl = "http://localhost/api/csp-report";

function makeRequest(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request(realPostUrl, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/csp-report",
      "User-Agent": "test-agent",
      ...headers,
    },
  });
}

beforeEach(() => {
  vi.mocked(logger.warn).mockReset();
});

describe("POST /api/csp-report", () => {
  it("logs a legacy single-object report and returns 204", async () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "https://traceronix.io/dashboard",
        "violated-directive": "script-src 'self'",
        "blocked-uri": "inline",
        "line-number": 42,
      },
    });
    const res = await POST(makeRequest(body) as never);
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledOnce();
    const arg = vi.mocked(logger.warn).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arg.url).toBe("https://traceronix.io/dashboard");
    expect(arg.directive).toBe("script-src 'self'");
    expect(arg.blocked).toBe("inline");
  });

  it("logs a modern Reporting-API array (one log call per entry)", async () => {
    const body = JSON.stringify([
      { type: "csp-violation", body: { "document-uri": "https://traceronix.io/a", "effective-directive": "img-src" } },
      { type: "csp-violation", body: { "document-uri": "https://traceronix.io/b", "effective-directive": "frame-src" } },
    ]);
    const res = await POST(makeRequest(body, { "Content-Type": "application/reports+json" }) as never);
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized bodies with 413 before parsing", async () => {
    // Generate ~32 KB of valid-looking JSON; route's MAX_BYTES is 16 KB.
    const huge = JSON.stringify({ "csp-report": { sample: "x".repeat(32 * 1024) } });
    const res = await POST(makeRequest(huge) as never);
    expect(res.status).toBe(413);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400 (no crash)", async () => {
    const res = await POST(makeRequest("{ this is not json") as never);
    expect(res.status).toBe(400);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("caps array length so an oversized report list cannot flood logs", async () => {
    // 100 reports — route's MAX_REPORTS is 20.
    const arr = Array.from({ length: 100 }, (_, i) => ({
      type: "csp-violation",
      body: { "document-uri": `https://traceronix.io/${i}`, "effective-directive": "script-src" },
    }));
    const res = await POST(makeRequest(JSON.stringify(arr)) as never);
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledTimes(20);
  });

  it("truncates very long string fields to bound log line size", async () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "https://traceronix.io/x",
        "script-sample": "x".repeat(5_000), // route caps at 2_000
        "violated-directive": "script-src",
      },
    });
    await POST(makeRequest(body) as never);
    const arg = vi.mocked(logger.warn).mock.calls[0]?.[1] as Record<string, unknown>;
    const sample = arg.sample as string;
    // 2 000 base cap + the literal "…[truncated]" suffix appended by the
    // route. The suffix is 12 characters (ellipsis + bracketed word), so
    // computing the bound from the suffix length keeps the test honest if
    // someone tweaks the marker without touching MAX_FIELD_LEN.
    const TRUNC_MARKER = "…[truncated]";
    expect(sample.length).toBeLessThanOrEqual(2_000 + TRUNC_MARKER.length);
    expect(sample.endsWith(TRUNC_MARKER)).toBe(true);
  });
});

describe("GET / OPTIONS /api/csp-report", () => {
  it("returns 405 for GET with Allow: POST, OPTIONS", () => {
    const res = GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("returns 204 for OPTIONS (CORS preflight friendly)", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });
});
