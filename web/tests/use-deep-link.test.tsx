import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDeepLink } from "@/lib/use-deep-link";

const replaceMock = vi.fn();
let pathnameMock = "/port-checker";
let paramsString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => pathnameMock,
  useSearchParams: () => new URLSearchParams(paramsString),
}));

beforeEach(() => {
  replaceMock.mockReset();
  pathnameMock = "/port-checker";
  paramsString = "";
});

describe("useDeepLink", () => {
  it("does NOT call setTarget when ?target= is absent", () => {
    const setTarget = vi.fn();
    renderHook(() => useDeepLink({ setTarget }));
    expect(setTarget).not.toHaveBeenCalled();
  });

  it("prefills the input when ?target= is present", () => {
    paramsString = "target=example.com";
    const setTarget = vi.fn();
    renderHook(() => useDeepLink({ setTarget }));
    expect(setTarget).toHaveBeenCalledWith("example.com");
  });

  it("trims whitespace around the prefilled target", () => {
    paramsString = "target=%20github.com%20";
    const setTarget = vi.fn();
    renderHook(() => useDeepLink({ setTarget }));
    expect(setTarget).toHaveBeenCalledWith("github.com");
  });

  it("fires onAutoRun exactly once on mount when ?target= is present", async () => {
    paramsString = "target=example.com";
    const setTarget = vi.fn();
    const onAutoRun = vi.fn();
    renderHook(() => useDeepLink({ setTarget, onAutoRun }));
    await waitFor(() => expect(onAutoRun).toHaveBeenCalledTimes(1));
  });

  it("does NOT fire onAutoRun when ?target= is absent", async () => {
    const setTarget = vi.fn();
    const onAutoRun = vi.fn();
    renderHook(() => useDeepLink({ setTarget, onAutoRun }));
    // Wait one macrotask just to be sure the setTimeout(0) didn't fire.
    await new Promise((r) => setTimeout(r, 5));
    expect(onAutoRun).not.toHaveBeenCalled();
  });

  it("buildUrl is pure — does NOT call router.replace", () => {
    const { result } = renderHook(() => useDeepLink({ setTarget: () => {} }));
    result.current.buildUrl("github.com");
    result.current.buildUrl("example.com");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("buildUrl returns the target as the URL query string", () => {
    const { result } = renderHook(() => useDeepLink({ setTarget: () => {} }));
    const url = result.current.buildUrl("github.com");
    expect(url).toContain("/port-checker");
    expect(url).toContain("target=github.com");
  });

  it("buildUrl strips empty/whitespace targets from the URL", () => {
    const { result } = renderHook(() => useDeepLink({ setTarget: () => {} }));
    expect(result.current.buildUrl("")).toMatch(/\/port-checker$/);
    expect(result.current.buildUrl("   ")).toMatch(/\/port-checker$/);
  });

  it("pushUrl calls router.replace with the new query string", () => {
    const { result } = renderHook(() => useDeepLink({ setTarget: () => {} }));
    act(() => {
      result.current.pushUrl("github.com");
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = String(replaceMock.mock.calls[0]?.[0] ?? "");
    expect(url).toBe("/port-checker?target=github.com");
  });
});
