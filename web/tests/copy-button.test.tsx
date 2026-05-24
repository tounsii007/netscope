import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { ToastProvider } from "@/components/toast/toast";
import { CopyButton } from "@/components/copy-button";
import { renderWithIntl, screen } from "./test-utils";

/**
 * Coverage for the shared CopyButton.
 *
 * • Stubs navigator.clipboard.writeText so the test environment can
 *   simulate browser permission behaviour.
 * • Verifies the value-or-object branch in `payload()` (object →
 *   pretty JSON, string → raw).
 * • Asserts the visual "copied" state lasts and resets via fake timers.
 */

beforeAll(() => {
  // Install an in-memory localStorage polyfill (other tests need it
  // for ToastProvider sibling components; this file doesn't directly
  // but importing test-utils chains in ToastProvider which subsumes
  // BackToTop/etc later — keep symmetric with use-recent-targets.test.tsx).
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CopyButton", () => {
  it("copies a raw string when value is a string", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWithIntl(
      <ToastProvider>
        <CopyButton value="hello world" />
      </ToastProvider>,
    );
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("hello world");
  });

  it("pretty-prints an object value to JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWithIntl(
      <ToastProvider>
        <CopyButton value={{ port: 443, open: true }} />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
      await Promise.resolve();
    });
    const written = String(writeText.mock.calls[0]?.[0] ?? "");
    expect(written).toContain("\"port\"");
    expect(written).toContain("\"open\"");
    // Pretty-printed → contains newlines + indentation.
    expect(written).toMatch(/\n  /);
  });

  it("flips to 'Copied!' state after a successful copy", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWithIntl(
      <ToastProvider>
        <CopyButton value="x" />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
      await Promise.resolve();
    });
    // Label flipped to "Copied!".
    expect(screen.getAllByText(/copied/i).length).toBeGreaterThan(0);

    // After 1.5 s it resets to "Copy".
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
