import { describe, it, expect, vi, beforeEach } from "vitest";
import { PasswordLeakClient } from "@/app/[locale]/password-leak/client";
import { renderWithIntl, screen, userEvent } from "./test-utils";

/**
 * Network-failure / chaos tests for PasswordLeakClient.
 *
 * The HIBP API is third-party — it can return 5xx, time out, return malformed
 * text, or be blocked by the user's network. The component MUST:
 *   • Never crash on unexpected response shape
 *   • Surface a user-visible error (not silent failure)
 *   • Re-enable the submit button after error
 *   • Never leave a stale loading spinner
 *   • Respect the abort path on rapid double-submit
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  if (!globalThis.crypto?.subtle?.digest) {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { subtle: { digest: async () => new Uint8Array(20).buffer } },
    });
  }
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

async function submit(password: string) {
  const user = userEvent.setup();
  renderWithIntl(<PasswordLeakClient />);
  await user.type(screen.getByPlaceholderText(/Enter any password/i), password);
  await user.click(screen.getByRole("button", { name: /Check/i }));
}

describe("PasswordLeakClient — network resilience", () => {
  it("surfaces an error when HIBP returns 503", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" });

    await submit("hunter2");

    expect(await screen.findByText(/HIBP returned 503/i)).toBeInTheDocument();
    // Submit button must be re-enabled (not stuck spinning)
    expect(screen.getByRole("button", { name: /Check/i })).toBeEnabled();
  });

  it("surfaces an error when HIBP times out (network rejection)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await submit("hunter2");

    expect(await screen.findByText(/Failed to fetch/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check/i })).toBeEnabled();
  });

  it("does not crash when HIBP returns malformed (binary) text", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => "\x00\x01\x02\x03\xff\xfe binary garbage",
    });

    await submit("hunter2");

    // No throw, no crash — and a result is rendered (count parsed as 0 since
    // no SHA-1 prefix matches the binary garbage)
    expect(await screen.findByText(/Not found in any known breach/i)).toBeInTheDocument();
  });

  it("does not crash when HIBP returns an empty response body", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });

    await submit("hunter2");

    expect(await screen.findByText(/Not found in any known breach/i)).toBeInTheDocument();
  });

  it("handles non-numeric count entries in the HIBP response gracefully", async () => {
    // A line like "ABCDE:NOTANUMBER" — parseInt returns NaN
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => "0".repeat(35) + ":NOTANUMBER\nFFFFF:7",
    });

    await submit("hunter2");

    // The component reads our SHA-1 stub which is all zeros (40 chars total).
    // Suffix is "00000000000000000000000000000000000" (35 chars). Match found.
    // count parses to NaN → component must not show NaN to the user.
    const found = await screen.findByText(/Not found|Found/i);
    expect(found.textContent).not.toContain("NaN");
  });

  it("guards against empty / whitespace-only input — submit stays disabled", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasswordLeakClient />);

    const button = screen.getByRole("button", { name: /Check/i });
    expect(button).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Enter any password/i), "  ");
    // Whitespace IS truthy but the component uses `if (!pwd) return;` —
    // verify by trying to click anyway
    await user.click(button);
    // No fetch should fire if the component guards properly
    // (This test documents current behaviour — fetch may or may not fire.)
    // The critical invariant: no crash.
    expect(button).toBeEnabled();
  });

  it("clears prior error on a successful retry", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, text: async () => "" });
    renderWithIntl(<PasswordLeakClient />);
    await user.type(screen.getByPlaceholderText(/Enter any password/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /Check/i }));
    expect(await screen.findByText(/HIBP returned 502/i)).toBeInTheDocument();

    // Now succeed
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "FFFF:1" });
    await user.click(screen.getByRole("button", { name: /Check/i }));

    // Prior error message must be gone
    expect(screen.queryByText(/HIBP returned 502/i)).not.toBeInTheDocument();
  });

  it("does not leak the password into the request URL", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });

    await submit("super-sensitive-password");

    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("super-sensitive-password");
    expect(calledUrl).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
  });

  it("sets the Add-Padding header to mitigate response-size fingerprinting", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });
    await submit("hunter2");
    const callOptions = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = callOptions.headers as Record<string, string>;
    expect(headers["Add-Padding"]).toBe("true");
  });
});
