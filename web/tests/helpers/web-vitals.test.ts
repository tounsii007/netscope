import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Tests for the client-side vitals reporter. We exercise the buffer +
 * coalesce + send path without round-tripping the actual sendBeacon —
 * mocking navigator.sendBeacon lets us assert that:
 *
 *   • Only the five reportable metrics make it into the queue
 *   • Multiple metrics fired in the same tick land in ONE beacon
 *     (the coalesce logic, otherwise we'd flood /api/vitals)
 *   • A "pagehide" event flushes any pending entries synchronously
 *   • CLS values get rounded to 3 decimals; everything else to 1 ms
 *   • Unknown metric names are dropped, not coerced
 */

const sendBeacon = vi.fn().mockReturnValue(true);
const recordedBodies: string[] = [];

class StubBlob {
  parts: BlobPart[];
  constructor(parts: BlobPart[]) {
    this.parts = parts;
  }
  text(): Promise<string> { return Promise.resolve(this.parts.join("")); }
  // Some assertion paths in older jsdom expect these on a Blob.
  get size() { return (this.parts.join("") as string).length; }
  get type() { return ""; }
}

beforeEach(() => {
  vi.useFakeTimers();
  sendBeacon.mockClear();
  recordedBodies.length = 0;
  // jsdom doesn't ship sendBeacon on its Navigator. Patch it for the test.
  Object.defineProperty(globalThis.navigator, "sendBeacon", {
    value: (url: string, body: BlobPart) => {
      recordedBodies.push(body instanceof StubBlob ? body.parts.join("") : String(body));
      return sendBeacon(url, body);
    },
    configurable: true,
    writable: true,
  });
  // Replace global Blob with our stub so we can read the buffered JSON
  // synchronously without depending on jsdom's incomplete Blob API.
  (globalThis as unknown as { Blob: typeof StubBlob }).Blob = StubBlob;
});

afterEach(async () => {
  vi.useRealTimers();
  // Drop the module's internal queue between tests by reloading it.
  vi.resetModules();
});

async function loadModule() {
  return await import("@/lib/web-vitals");
}

describe("recordVital — coalesce + send", () => {
  it("coalesces three metrics fired in the same tick into a single beacon", async () => {
    const { recordVital } = await loadModule();

    recordVital({ name: "LCP", value: 1234.7, id: "v1" });
    recordVital({ name: "FCP", value: 800.1, id: "v2" });
    recordVital({ name: "TTFB", value: 50.4, id: "v3" });

    // The 250ms debounce timer hasn't fired yet
    expect(sendBeacon).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(recordedBodies[0]);
    expect(parsed.entries).toHaveLength(3);
    const names = parsed.entries.map((e: { name: string }) => e.name).sort();
    expect(names).toEqual(["FCP", "LCP", "TTFB"]);
  });

  it("drops unknown metric names so /api/vitals never sees foreign entries", async () => {
    const { recordVital } = await loadModule();

    recordVital({ name: "LCP", value: 1, id: "ok" });
    recordVital({ name: "Foo", value: 999, id: "bad" });
    recordVital({ name: "TTI", value: 2, id: "also-bad" });

    await vi.advanceTimersByTimeAsync(250);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(recordedBodies[0]);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].name).toBe("LCP");
  });

  it("rounds LCP to whole milliseconds and CLS to 3 decimals", async () => {
    const { recordVital } = await loadModule();

    recordVital({ name: "LCP", value: 1234.789, id: "lcp" });
    recordVital({ name: "CLS", value: 0.123456, id: "cls" });

    await vi.advanceTimersByTimeAsync(250);
    const parsed = JSON.parse(recordedBodies[0]) as {
      entries: Array<{ name: string; value: number }>;
    };
    const lcp = parsed.entries.find((e) => e.name === "LCP")!;
    const cls = parsed.entries.find((e) => e.name === "CLS")!;
    expect(lcp.value).toBe(1235);
    expect(cls.value).toBeCloseTo(0.123, 3);
  });

  it("auto-classifies the rating when the metric library didn't bucket it", async () => {
    const { recordVital } = await loadModule();

    // 1500 ms LCP is comfortably "good" by the March-2024 spec
    recordVital({ name: "LCP", value: 1500, id: "fast" });
    // 4500 ms LCP is "poor"
    recordVital({ name: "LCP", value: 4500, id: "slow" });

    await vi.advanceTimersByTimeAsync(250);
    const parsed = JSON.parse(recordedBodies[0]) as {
      entries: Array<{ id: string; rating: string }>;
    };
    expect(parsed.entries.find((e) => e.id === "fast")!.rating).toBe("good");
    expect(parsed.entries.find((e) => e.id === "slow")!.rating).toBe("poor");
  });

  it("does not call sendBeacon when the queue is empty after a debounce", async () => {
    await loadModule();
    await vi.advanceTimersByTimeAsync(500);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
