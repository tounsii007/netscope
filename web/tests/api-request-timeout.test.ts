import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { request, ApiError } from "@/lib/api/request";

/**
 * The fetch wrapper now bounds every request with a hard timeout (and
 * surfaces friendly error messages). These tests stub `fetch` directly
 * — bypassing MSW — so we can simulate hangs, refused connections, and
 * 5xx responses without depending on the network.
 */
describe("request() — timeout, errors, and message mapping", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  it("rejects with ApiError after the 30 s timeout when fetch hangs forever", async () => {
    globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;

    const promise = request("/api/v1/dns/example.com");
    promise.catch(() => {}); // suppress unhandled-rejection while we advance timers

    await vi.advanceTimersByTimeAsync(30_001);
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 0, message: /timed out/i });
  });

  it("collapses 'Failed to fetch' network errors into a friendly message", async () => {
    globalThis.fetch = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;

    await expect(request("/api/v1/dns/example.com")).rejects.toMatchObject({
      message: /network unreachable/i,
      status: 0,
    });
  });

  it("preserves the backend's error message on 5xx responses", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: "upstream temporarily exhausted" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        })
      )) as typeof fetch;

    await expect(request("/api/v1/dns/example.com")).rejects.toMatchObject({
      message: "upstream temporarily exhausted",
      status: 503,
    });
  });

  it("returns the parsed JSON body on a 200 response", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, n: 42 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )) as typeof fetch;

    await expect(request("/api/v1/dns/example.com")).resolves.toEqual({ ok: true, n: 42 });
  });
});
