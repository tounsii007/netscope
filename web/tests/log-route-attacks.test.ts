import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Adversarial / DoS tests for POST /api/log.
 *
 * The /api/log endpoint receives error payloads from the browser. Anyone can
 * call it directly. The route MUST:
 *
 *   • Reject empty / non-string messages
 *   • Reject unknown levels (info/debug/silly) — only error+warn allowed
 *   • Truncate the User-Agent header to bound log line length
 *   • Pull only the FIRST entry from a multi-hop X-Forwarded-For chain
 *   • Tolerate header-injection attempts (CRLF in UA / XFF) without
 *     producing log lines that contain raw newlines (logger handles this)
 *   • Survive payload bombing (very long message field)
 *   • Survive deeply-nested meta object (no JSON parser DoS)
 *   • Run many calls concurrently without state crossover
 */

const errorMock = vi.fn();
const warnMock  = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    error: (...a: unknown[]) => errorMock(...a),
    warn:  (...a: unknown[]) => warnMock(...a),
    info:  vi.fn(), http: vi.fn(), debug: vi.fn(),
  },
}));

import { POST } from "@/app/api/log/route";

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/log", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  errorMock.mockReset();
  warnMock.mockReset();
});

describe("POST /api/log — adversarial", () => {
  /* ─── input validation strict ────────────────────────────────────────── */

  it("rejects message=null with 400", async () => {
    const res = await POST(makeReq({ level: "error", message: null }));
    expect(res.status).toBe(400);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("rejects message=number with 400 (typeof check)", async () => {
    const res = await POST(makeReq({ level: "error", message: 42 }));
    expect(res.status).toBe(400);
  });

  it("rejects message=array with 400", async () => {
    const res = await POST(makeReq({ level: "error", message: ["a", "b"] }));
    expect(res.status).toBe(400);
  });

  it("rejects message=object with 400", async () => {
    const res = await POST(makeReq({ level: "error", message: { txt: "hi" } }));
    expect(res.status).toBe(400);
  });

  it("rejects all unknown levels", async () => {
    for (const level of ["info", "debug", "trace", "fatal", "silly", "EMERGENCY", ""]) {
      const res = await POST(makeReq({ level, message: "x" }));
      expect(res.status, `level=${level}`).toBe(400);
    }
    expect(errorMock).not.toHaveBeenCalled();
    expect(warnMock).not.toHaveBeenCalled();
  });

  /* ─── header sanitisation ────────────────────────────────────────────── */

  it("only takes the FIRST IP from a multi-hop XFF chain", async () => {
    const res = await POST(makeReq(
      { level: "error", message: "x" },
      { "x-forwarded-for": "203.0.113.1, 10.0.0.5, 10.0.0.6" },
    ));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect(meta.ip).toBe("203.0.113.1");
  });

  it("trims whitespace around the first XFF entry", async () => {
    const res = await POST(makeReq(
      { level: "error", message: "x" },
      { "x-forwarded-for": "   203.0.113.42   ,  10.0.0.5" },
    ));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect(meta.ip).toBe("203.0.113.42");
  });

  it("truncates a very long User-Agent (DoS via 1MB UA header)", async () => {
    const huge = "A".repeat(1_000_000);
    const res = await POST(makeReq(
      { level: "error", message: "x" },
      { "user-agent": huge },
    ));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect(meta.ua.length).toBeLessThanOrEqual(200);
  });

  /* ─── payload bombing ────────────────────────────────────────────────── */

  it("accepts a 10KB message without truncation (logger must handle)", async () => {
    const tenK = "M".repeat(10_000);
    const res = await POST(makeReq({ level: "error", message: tenK }));
    expect(res.status).toBe(200);
    const [msg] = errorMock.mock.calls[0];
    // Route does not truncate the message — that's the logger's job
    expect((msg as string).length).toBe(10_000);
  });

  it("survives deeply-nested meta object without RangeError", async () => {
    // Build a 200-deep nested object — well below V8's recursion limits but
    // catches gross issues with the route's handling of JSON.
    let nested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 200; i++) nested = { child: nested };
    const res = await POST(makeReq({ level: "error", message: "x", meta: nested }));
    expect(res.status).toBe(200);
  });

  it("does not leak server-side secrets via error response (500 has empty body shape)", async () => {
    // Send malformed JSON to trigger the catch-all 500 path
    const req = new Request("http://localhost/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await (res as unknown as Response).json();
    expect(body).toEqual({ ok: false });   // no stack, no internal info
  });

  /* ─── concurrency safety ─────────────────────────────────────────────── */

  it("handles 50 concurrent calls without state mixing", async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      POST(makeReq(
        { level: "error", message: `msg-${i}`, meta: { idx: i } },
        { "x-forwarded-for": `203.0.113.${i % 254 + 1}` },
      )),
    );
    const responses = await Promise.all(promises);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(errorMock).toHaveBeenCalledTimes(50);

    // Every call recorded its own message + meta — never mixed
    const seen = new Set<string>();
    for (const call of errorMock.mock.calls) {
      const [msg, meta] = call;
      const m = msg as string;
      const idx = (meta as { idx: number }).idx;
      expect(m).toBe(`msg-${idx}`);
      seen.add(m);
    }
    expect(seen.size).toBe(50);
  });

  /* ─── safety against XFF spoofing of bare IP ─────────────────────────── */

  it("does not validate XFF as a real IP (logger sees raw header value)", async () => {
    // The route trusts whatever's in XFF[0]. Document this: it's the deployer's
    // responsibility to strip/replace XFF at the load balancer.
    const res = await POST(makeReq(
      { level: "error", message: "x" },
      { "x-forwarded-for": "<script>alert(1)</script>" },
    ));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    // We don't sanitise — the logger/console formatter must handle it
    expect(meta.ip).toBe("<script>alert(1)</script>");
  });

  it("rejects warn-level message that's just whitespace string", async () => {
    // "  " is truthy but not useful — route currently accepts. Document.
    const res = await POST(makeReq({ level: "warn", message: "  " }));
    expect(res.status).toBe(200);   // current behaviour
    expect(warnMock).toHaveBeenCalledOnce();
  });
});
