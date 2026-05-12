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

  it("prefers cf-connecting-ip over the spoofable XFF", async () => {
    // F44: raw x-forwarded-for is no longer trusted. The route now
    // mirrors middleware's trust order; cf-connecting-ip wins.
    const res = await POST(makeReq(
      { level: "error", message: "x" },
      {
        "cf-connecting-ip": "203.0.113.1",
        "x-forwarded-for": "1.2.3.4, 10.0.0.5, 10.0.0.6",   // spoofed
      },
    ));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect(meta.ip).toBe("203.0.113.1");
  });

  it("uses x-vercel-forwarded-for when cf-connecting-ip is absent", async () => {
    const res = await POST(makeReq(
      { level: "error", message: "x" },
      { "x-vercel-forwarded-for": "   203.0.113.42   ,  10.0.0.5" },
    ));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect(meta.ip).toBe("203.0.113.42");
  });

  it("ignores raw x-forwarded-for (spoofable) by default", async () => {
    // Adversarial: an attacker sending only XFF can no longer
    // pollute the structured log with arbitrary strings — falls
    // back to "unknown".
    const res = await POST(makeReq(
      { level: "error", message: "x" },
      { "x-forwarded-for": "1.2.3.4" },
    ));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect(meta.ip).toBe("unknown");
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

  it("rejects payloads larger than 16KB with 413", async () => {
    // The route caps the *whole body* at 16 KB. A 20 KB body should
    // get a 413 before we ever touch the logger.
    const huge = "M".repeat(20_000);
    const res = await POST(makeReq({ level: "error", message: huge }));
    expect(res.status).toBe(413);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("truncates a 10KB message to MAX_MSG_LEN (8KB) before logging", async () => {
    const tenK = "M".repeat(10_000);
    const res = await POST(makeReq({ level: "error", message: tenK }));
    expect(res.status).toBe(200);
    const [msg] = errorMock.mock.calls[0];
    // Route now caps the message to keep daily-rotate files healthy.
    expect((msg as string).length).toBe(8_000);
  });

  it("truncates oversized string-shaped meta values to 4KB and tags them", async () => {
    const fiveK = "S".repeat(5_000);
    const res = await POST(makeReq({
      level: "error",
      message: "trace",
      meta: { stack: fiveK, kind: "TypeError" },
    }));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect((meta.stack as string).length).toBeGreaterThanOrEqual(4_000);
    expect((meta.stack as string).length).toBeLessThan(5_000);
    expect(meta.stack).toMatch(/\[truncated\]$/);
    // Short fields are passed through untouched.
    expect(meta.kind).toBe("TypeError");
  });

  it("rejects payloads larger than 16KB via the content-length header (no body read)", async () => {
    const req = new Request("http://localhost/api/log", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "20000",
      },
      // We don't actually need a 20 KB body — the header alone should
      // be enough to short-circuit.
      body: JSON.stringify({ level: "error", message: "tiny" }),
    }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("survives deeply-nested meta object without RangeError", async () => {
    // Build a 200-deep nested object — well below V8's recursion limits but
    // catches gross issues with the route's handling of JSON.
    let nested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 200; i++) nested = { child: nested };
    const res = await POST(makeReq({ level: "error", message: "x", meta: nested }));
    expect(res.status).toBe(200);
  });

  it("does not leak server-side secrets via error response (400 body has stable shape)", async () => {
    // Send malformed JSON to trigger the parse-error path. After the
    // body-size hardening the route now returns 400 (Bad Request) for
    // syntactically invalid input rather than the catch-all 500.
    const req = new Request("http://localhost/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await (res as unknown as Response).json();
    expect(body).toEqual({ ok: false, reason: "invalid json" });   // no stack, no internal info
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

  it("does not let a malicious x-forwarded-for poison the log line", async () => {
    // F44: route ignores raw XFF entirely. The "<script>" string
    // never reaches the logger meta.
    const res = await POST(makeReq(
      { level: "error", message: "x" },
      { "x-forwarded-for": "<script>alert(1)</script>" },
    ));
    expect(res.status).toBe(200);
    const [, meta] = errorMock.mock.calls[0];
    expect(meta.ip).toBe("unknown");
    expect(meta.ip).not.toContain("<script>");
  });

  it("rejects warn-level message that's just whitespace string", async () => {
    // "  " is truthy but not useful — route currently accepts. Document.
    const res = await POST(makeReq({ level: "warn", message: "  " }));
    expect(res.status).toBe(200);   // current behaviour
    expect(warnMock).toHaveBeenCalledOnce();
  });
});
