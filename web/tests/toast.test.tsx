import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { ToastProvider, useToast, copyWithToast } from "@/components/toast/toast";
import { renderWithIntl, screen } from "./test-utils";

/**
 * Coverage for the in-memory toast provider + clipboard helper.
 *
 * We can't render hooks directly — we mount a tiny harness component
 * that exposes the toast API via DOM-visible side effects.
 */

function Harness() {
  const toast = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast.success("Saved")}>
        push-success
      </button>
      <button type="button" onClick={() => toast.error("Boom", 0)}>
        push-error
      </button>
      <button
        type="button"
        onClick={() => toast.show({ message: "Hello", kind: "info", duration: 0 })}
      >
        push-info
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("renders nothing visible until a toast is shown", () => {
    renderWithIntl(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    // No toast yet — the live region is mounted (status role) but empty.
    expect(screen.queryByText(/Saved/)).not.toBeInTheDocument();
  });

  it("pushes a success toast and auto-dismisses after the default 3s", () => {
    renderWithIntl(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("push-success"));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3001);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("keeps a toast with duration=0 on screen until dismissed", () => {
    renderWithIntl(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("push-error"));
    expect(screen.getByText("Boom")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Boom")).toBeInTheDocument();

    // Manually dismiss via the X button.
    fireEvent.click(screen.getByLabelText(/dismiss/i));
    expect(screen.queryByText("Boom")).not.toBeInTheDocument();
  });

  it("stacks multiple toasts in order", () => {
    renderWithIntl(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("push-info"));
    fireEvent.click(screen.getByText("push-error"));
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Boom")).toBeInTheDocument();
  });

  it("useToast outside the provider throws", () => {
    function Naked() {
      useToast();
      return null;
    }
    // Use plain `render` (not renderWithIntl) so there's no provider in
    // scope. Suppress React's noisy console.error so the assertion
    // output stays clean.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<Naked />)).toThrow(/useToast must be used inside/i);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("copyWithToast", () => {
  it("pushes a success toast when the clipboard write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    function CopyHarness() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            copyWithToast("text", toast, { ok: "Copied!", fail: "Fail" })
          }
        >
          copy
        </button>
      );
    }
    renderWithIntl(
      <ToastProvider>
        <CopyHarness />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText("copy"));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("text");
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  it("pushes an error toast when clipboard.writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("nope"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    function CopyHarness() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            copyWithToast("text", toast, { ok: "Copied!", fail: "Failed" })
          }
        >
          copy
        </button>
      );
    }
    renderWithIntl(
      <ToastProvider>
        <CopyHarness />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText("copy"));
      await Promise.resolve();
    });
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
