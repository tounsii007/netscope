import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for POST /api/csp-report — the Reporting-API sink that
 * collects CSP violation reports from real browsers and funnels
 * them into the structured server logger so we get observability
 * on what content the page is actually trying to load.
 *
 * Two delivery formats coexist in production browsers:
 *   • legacy   — Firefox + older Chromium, single `application/csp-report`
 *                object: { "csp-report": { ... } }
 *   • modern   — Chromium >=99 + Safari, batched array of
 *                Reporting-API records: [{ type, body, ... }]
 *
 * The route must accept both and log a warn-level entry per
 * violation. It must NOT throw on malformed input or oversized
 * bodies — those are exactly the inputs hostile browsers / scanners
 * will probe with.
 */

const warnMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    warn:  (...args: unknown[]) => warnMock(...args),
    error: vi.fn(),
    info:  vi.fn(),
    http:  vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST, GET, OPTIONS } from "@/app/api/csp-report/route";

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/csp-report", {
    method: "POST",
    headers: { "content-type": "application/csp-report", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  warnMock.mockReset();
});

describe("POST /api/csp-report", () => {
  it("accepts a legacy csp-report payload and logs one warn entry", async () => {
    const res = await POST(makeReq({
      "csp-report": {
        "document-uri": "https://netscope.io/de/dashboard",
        "violated-directive": "script-src",
        "effective-directive": "script-src",
        "blocked-uri": "inline",
        "line-number": 42,
        "column-number": 8,
        disposition: "enforce",
        "status-code": 200,
        "script-sample": "console.log('boom')",
      },
    }, { "user-agent": "Mozilla/5.0 Firefox/130" }));

    expect(res.status).toBe(204);
    expect(warnMock).toHaveBeenCalledTimes(1);

    const [evt, meta] = warnMock.mock.calls[0];
    expect(evt).toBe("csp-violation");
    expect(meta).toMatchObject({
      source: "browser",
      url:    "https://netscope.io/de/dashboard",
      directive: "script-src",
      blocked: "inline",
      lineNumber: 42,
      columnNumber: 8,
      disposition: "enforce",
      statusCode: 200,
      ua: "Mozilla/5.0 Firefox/130",
    });
    expect(meta.sample).toBe("console.log('boom')");
  });

  it("accepts a modern Reporting-API batch and logs one entry per report", async () => {
    const res = await POST(makeReq([
      {
        type: "csp-violation",
        age: 12,
        url: "https://netscope.io/de/dashboard",
        body: {
          "document-uri": "https://netscope.io/de/dashboard",
          "effective-directive": "style-src-elem",
          "blocked-uri": "https://evil.example/x.css",
          disposition: "enforce",
        },
      },
      {
        type: "csp-violation",
        body: {
          "document-uri": "https://netscope.io/en",
          "effective-directive": "img-src",
          "blocked-uri": "https://evil.example/x.png",
        },
      },
    ]));

    expect(res.status).toBe(204);
    expect(warnMock).toHaveBeenCalledTimes(2);

    const [, firstMeta] = warnMock.mock.calls[0];
    expect(firstMeta.directive).toBe("style-src-elem");
    expect(firstMeta.blocked).toBe("https://evil.example/x.css");

    const [, secondMeta] = warnMock.mock.calls[1];
    expect(secondMeta.directive).toBe("img-src");
  });

  it("caps the number of reports logged per request at 20", async () => {
    const oversizedBatch = Array.from({ length: 50 }, (_, i) => ({
      type: "csp-violation",
      body: {
        "document-uri": "https://netscope.io/de",
        "effective-directive": "script-src",
        "blocked-uri": `https://evil.example/${i}.js`,
      },
    }));
    const res = await POST(makeReq(oversizedBatch));

    expect(res.status).toBe(204);
    // Cap is MAX_REPORTS = 20; the rest must be silently dropped so
    // a single hostile batch can't blow up the log channel.
    expect(warnMock.mock.calls.length).toBeLessThanOrEqual(20);
    expect(warnMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("truncates oversized string fields rather than logging the full payload", async () => {
    // Each field exceeds MAX_FIELD_LEN (2 KB) but the whole body
    // stays under MAX_BYTES (16 KB) — we want to exercise per-field
    // truncation, not the 413 "payload too large" path.
    const wide = "A".repeat(4_000);
    await POST(makeReq({
      "csp-report": {
        "document-uri": wide,
        "effective-directive": "script-src",
        "blocked-uri": "inline",
        "script-sample": wide,
      },
    }));

    expect(warnMock).toHaveBeenCalledTimes(1);
    const [, meta] = warnMock.mock.calls[0];
    expect(meta.url.length).toBeLessThanOrEqual(2_100);
    expect(meta.url.endsWith("…[truncated]")).toBe(true);
    expect(meta.sample.endsWith("…[truncated]")).toBe(true);
  });

  it("returns 400 on malformed JSON", async () => {
    const req = new Request("http://localhost/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: "{not-json",
    }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("returns 413 when content-length exceeds 16 KB", async () => {
    const req = new Request("http://localhost/api/csp-report", {
      method: "POST",
      headers: {
        "content-type": "application/csp-report",
        "content-length": String(64 * 1024),
      },
      body: "{}",
    }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("silently drops a report missing its body envelope", async () => {
    const res = await POST(makeReq({ foo: "bar" }));
    expect(res.status).toBe(204);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("always responds with Cache-Control: no-store", async () => {
    const res = await POST(makeReq({
      "csp-report": { "document-uri": "x", "effective-directive": "script-src", "blocked-uri": "inline" },
    }));
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
  });

  it("GET responds 405 with Allow: POST, OPTIONS", () => {
    const res = GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toMatch(/POST/);
  });

  it("OPTIONS preflight returns 204 with Allow header", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toMatch(/POST/);
  });
});
