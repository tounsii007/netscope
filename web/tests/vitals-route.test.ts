import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/vitals is the same-origin sink for browser web-vitals
 * beacons. It is intentionally exempt from the global rate limiter
 * (see middleware.ts) — so the route itself has to bound payload
 * size and entry count to stay safe under hostile load.
 *
 * These tests verify:
 *   • valid LCP/INP/CLS/FCP/TTFB names land in the logger
 *   • unknown metric names are silently dropped (not rejected)
 *   • non-finite numeric values are dropped
 *   • payloads over 8 KB return 413 (both content-length + body length)
 *   • >50 entries are truncated to the first 50
 *   • oversize string fields are capped at 256 chars
 *   • malformed JSON returns 400
 *   • GET returns 405
 */

const infoMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    info: (...a: unknown[]) => infoMock(...a),
    warn: vi.fn(), error: vi.fn(), http: vi.fn(), debug: vi.fn(),
  },
}));

import { POST, GET } from "@/app/api/vitals/route";

function makeReq(body: unknown, headers: Record<string, string> = {}): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/vitals", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => infoMock.mockReset());

describe("POST /api/vitals", () => {
  it("records valid entries and returns the count", async () => {
    const res = await POST(makeReq({
      entries: [
        { name: "LCP", value: 1234, rating: "good", page: "/" },
        { name: "INP", value: 200, rating: "needs-improvement" },
      ],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, recorded: 2 });
    expect(infoMock).toHaveBeenCalledTimes(2);
  });

  it("silently drops unknown metric names without breaking the batch", async () => {
    const res = await POST(makeReq({
      entries: [
        { name: "LCP", value: 1234 },
        { name: "FOO", value: 1 },          // unknown — drop
        { name: "TTFB", value: 50 },
      ],
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).recorded).toBe(2);
  });

  it("drops entries with non-finite values", async () => {
    const res = await POST(makeReq({
      entries: [
        { name: "LCP", value: NaN },
        { name: "CLS", value: Infinity },
        { name: "FCP", value: 80 },
      ],
    }));
    expect((await res.json()).recorded).toBe(1);
  });

  it("returns 413 when content-length exceeds 8 KB", async () => {
    const req = new Request("http://localhost/api/vitals", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "20000" },
      body: JSON.stringify({ entries: [{ name: "LCP", value: 1 }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(infoMock).not.toHaveBeenCalled();
  });

  it("returns 413 when the body itself is over 8 KB", async () => {
    const big = { entries: [{ name: "LCP", value: 1, page: "x".repeat(9000) }] };
    const res = await POST(makeReq(big));
    expect(res.status).toBe(413);
  });

  it("caps the entry list at 50 even if more are submitted", async () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      name: "LCP", value: i,
    }));
    const res = await POST(makeReq({ entries }));
    expect((await res.json()).recorded).toBe(50);
    expect(infoMock).toHaveBeenCalledTimes(50);
  });

  it("caps oversize string fields at 256 chars per metric", async () => {
    const longPage = "/" + "x".repeat(500);
    await POST(makeReq({
      entries: [{ name: "LCP", value: 1, page: longPage }],
    }));
    const [, meta] = infoMock.mock.calls[0];
    expect((meta.page as string).length).toBe(256);
  });

  it("returns 400 on malformed JSON", async () => {
    const req = new Request("http://localhost/api/vitals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200/recorded=0 for an empty entries array (so beacons can be no-ops)", async () => {
    const res = await POST(makeReq({ entries: [] }));
    expect(res.status).toBe(200);
    expect((await res.json()).recorded).toBe(0);
  });
});

describe("GET /api/vitals", () => {
  it("returns 405 with use_POST hint", async () => {
    const res = GET();
    expect(res.status).toBe(405);
    expect((await res.json()).error).toBe("use_POST");
  });

  it("returns 405 with an Allow header naming POST", () => {
    const res = GET();
    expect(res.headers.get("allow")).toMatch(/POST/);
  });
});

describe("/api/vitals cache headers", () => {
  it("emits Cache-Control: no-store on a successful POST", async () => {
    const res = await POST(makeReq({ entries: [{ name: "LCP", value: 1 }] }));
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
  });

  it("emits Cache-Control: no-store on a 413 (oversize body)", async () => {
    const big = { entries: [{ name: "LCP", value: 1, page: "x".repeat(9000) }] };
    const res = await POST(makeReq(big));
    expect(res.status).toBe(413);
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
  });

  it("emits Cache-Control: no-store on a 400 (malformed body)", async () => {
    const req = new Request("http://localhost/api/vitals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
  });

  it("emits Cache-Control: no-store on a GET 405", () => {
    expect(GET().headers.get("cache-control")).toMatch(/no-store/i);
  });
});
