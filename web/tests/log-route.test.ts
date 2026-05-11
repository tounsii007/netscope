import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for POST /api/log — the client-side error reporter that funnels
 * browser-thrown exceptions into the server logger so they end up in
 * error.YYYY-MM-DD.log instead of being lost to the user's console.
 */

// Mock the server-side logger so we can inspect the exact call.
const errorMock = vi.fn();
const warnMock  = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    error: (...args: unknown[]) => errorMock(...args),
    warn:  (...args: unknown[]) => warnMock(...args),
    info:  vi.fn(),
    http:  vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST } from "@/app/api/log/route";

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/log", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  errorMock.mockReset();
  warnMock.mockReset();
});

describe("POST /api/log", () => {
  it("rejects payload with no message (400)", async () => {
    const res = await POST(makeReq({ level: "error" }));
    expect(res.status).toBe(400);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("rejects an unaccepted level like info (400)", async () => {
    const res = await POST(makeReq({ level: "info", message: "hello" }));
    expect(res.status).toBe(400);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("forwards an error-level message to logger.error with enriched meta", async () => {
    const res = await POST(makeReq(
      { level: "error", message: "TypeError: x is not a function", meta: { url: "/foo" } },
      { "x-forwarded-for": "8.8.8.8, 10.0.0.1", "user-agent": "Mozilla/5.0" },
    ));
    expect(res.status).toBe(200);
    expect(errorMock).toHaveBeenCalledTimes(1);

    const [msg, meta] = errorMock.mock.calls[0];
    expect(msg).toMatch(/TypeError/);
    expect(meta).toMatchObject({
      url: "/foo",
      source: "browser",
      ip:     "8.8.8.8",       // first XFF entry, trimmed
      ua:     "Mozilla/5.0",
    });
  });

  it("forwards a warn-level message to logger.warn", async () => {
    const res = await POST(makeReq({ level: "warn", message: "deprecation" }));
    expect(res.status).toBe(200);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("falls back to ip='unknown' when no XFF/X-Real-IP header is present", async () => {
    const res = await POST(makeReq({ level: "error", message: "boom" }));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect(meta.ip).toBe("unknown");
  });

  it("truncates a very long User-Agent to <=200 chars", async () => {
    const longUA = "M".repeat(500);
    const res = await POST(makeReq(
      { level: "error", message: "boom" },
      { "user-agent": longUA },
    ));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect(meta.ua.length).toBeLessThanOrEqual(200);
  });

  it("returns 400 on malformed JSON body", async () => {
    const req = new Request("http://localhost/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
