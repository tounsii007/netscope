import { describe, it, expect, vi, beforeEach } from "vitest";
import { PasswordLeakClient } from "@/app/[locale]/password-leak/client";
import { renderWithIntl, renderWithLocale, screen, userEvent } from "./test-utils";

/**
 * password-leak/client hashes locally with crypto.subtle then calls HIBP
 * directly (api.pwnedpasswords.com). The component never goes through the
 * NetScope backend, so we stub fetch to control HIBP responses.
 */
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  // jsdom doesn't ship crypto.subtle with .digest by default — node 20+ has it
  // exposed via globalThis.crypto.subtle. If missing, hot-patch with a stub.
  if (!globalThis.crypto?.subtle?.digest) {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          // Deterministic 20-byte output for tests
          digest: async () => new Uint8Array(20).buffer,
        },
      },
    });
  }
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("PasswordLeakClient", () => {
  it("renders the SHA-1 privacy note and submit disabled with no input", () => {
    renderWithIntl(<PasswordLeakClient />);
    expect(screen.getByText(/SHA-1 happens in your browser/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /Check/i });
    expect(btn).toBeDisabled();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasswordLeakClient />);
    const input = screen.getByPlaceholderText(/Enter any password/i) as HTMLInputElement;
    expect(input.type).toBe("password");

    // The eye toggle is the unlabeled button next to the input
    const buttons = screen.getAllByRole("button");
    const toggle = buttons.find((b) => b.getAttribute("type") === "button");
    expect(toggle).toBeDefined();
    await user.click(toggle!);
    expect(input.type).toBe("text");
  });

  it("shows safe state when HIBP returns no match", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => "ABCDE:9\n12345:3",
    });

    const user = userEvent.setup();
    renderWithIntl(<PasswordLeakClient />);
    await user.type(screen.getByPlaceholderText(/Enter any password/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /Check/i }));
    expect(await screen.findByText(/Not found in any known breach/i)).toBeInTheDocument();
  });

  it("renders the translated privacy note in German", () => {
    renderWithLocale(<PasswordLeakClient />, "de");
    // Polish pass standardised on the informal "du"-form, so the privacy
    // note now says "in deinem Browser" — not "Ihrem Browser".
    expect(screen.getByText(/SHA-1 wird in deinem Browser/i)).toBeInTheDocument();
  });

  it("renders the translated privacy note in Chinese", () => {
    renderWithLocale(<PasswordLeakClient />, "zh");
    expect(screen.getByText(/SHA-1 在您的浏览器中计算/)).toBeInTheDocument();
  });
});
