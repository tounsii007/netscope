import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecentTargets } from "@/lib/use-recent-targets";

/**
 * jsdom raises SecurityError on `window.localStorage` for opaque
 * origins (the default `about:blank` URL the test env runs at). We
 * install a tiny in-memory polyfill keyed off the Window object so
 * the hook under test can read/write without changing app code.
 */
beforeAll(() => {
  const store = new Map<string, string>();
  const polyfill = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: polyfill,
  });
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("useRecentTargets", () => {
  it("starts empty when no localStorage entry exists", () => {
    const { result } = renderHook(() => useRecentTargets("port-checker"));
    expect(result.current.recent).toEqual([]);
  });

  it("remember() pushes the value to the front, deduped case-insensitively", () => {
    const { result } = renderHook(() => useRecentTargets("port-checker"));
    act(() => result.current.remember("Example.com"));
    act(() => result.current.remember("github.com"));
    act(() => result.current.remember("example.com"));
    // Newest case-folded match wins position 0; "Example.com" was
    // dropped, replaced by lowercase.
    expect(result.current.recent).toEqual(["example.com", "github.com"]);
  });

  it("trims and ignores blank values", () => {
    const { result } = renderHook(() => useRecentTargets("port-checker"));
    act(() => result.current.remember("   "));
    act(() => result.current.remember(""));
    expect(result.current.recent).toEqual([]);
  });

  it("caps history at 5 entries (most recent kept)", () => {
    const { result } = renderHook(() => useRecentTargets("port-checker"));
    act(() => {
      result.current.remember("a.com");
      result.current.remember("b.com");
      result.current.remember("c.com");
      result.current.remember("d.com");
      result.current.remember("e.com");
      result.current.remember("f.com");
    });
    expect(result.current.recent).toHaveLength(5);
    expect(result.current.recent[0]).toBe("f.com");
    expect(result.current.recent[4]).toBe("b.com");
    expect(result.current.recent).not.toContain("a.com");
  });

  it("forget() removes a single entry", () => {
    const { result } = renderHook(() => useRecentTargets("port-checker"));
    act(() => {
      result.current.remember("a.com");
      result.current.remember("b.com");
    });
    act(() => result.current.forget("a.com"));
    expect(result.current.recent).toEqual(["b.com"]);
  });

  it("clear() wipes everything", () => {
    const { result } = renderHook(() => useRecentTargets("port-checker"));
    act(() => {
      result.current.remember("a.com");
      result.current.remember("b.com");
    });
    act(() => result.current.clear());
    expect(result.current.recent).toEqual([]);
  });

  it("persists across hook remounts (same slug)", () => {
    const { result, unmount } = renderHook(() => useRecentTargets("dns-lookup"));
    act(() => result.current.remember("first.example"));
    unmount();
    const { result: r2 } = renderHook(() => useRecentTargets("dns-lookup"));
    expect(r2.current.recent).toContain("first.example");
  });

  it("scopes by slug — different tools see different histories", () => {
    const { result: r1 } = renderHook(() => useRecentTargets("port-checker"));
    const { result: r2 } = renderHook(() => useRecentTargets("ssl-check"));
    act(() => r1.current.remember("only-in-ports.com"));
    expect(r2.current.recent).toEqual([]);
  });

  it("survives corrupted localStorage payloads", () => {
    window.localStorage.setItem("tx:recent:port-checker", "{not-json");
    const { result } = renderHook(() => useRecentTargets("port-checker"));
    expect(result.current.recent).toEqual([]);
  });

  it("survives an array containing non-string entries", () => {
    window.localStorage.setItem(
      "tx:recent:port-checker",
      JSON.stringify(["ok.com", 42, null, "also-ok.com"]),
    );
    const { result } = renderHook(() => useRecentTargets("port-checker"));
    expect(result.current.recent).toEqual(["ok.com", "also-ok.com"]);
  });
});
