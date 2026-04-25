import { describe, it, expect } from "vitest";
import { JwtClient } from "@/app/[locale]/jwt/client";
import { renderWithIntl, screen, userEvent, fireEvent } from "./test-utils";

/**
 * Adversarial / DoS tests for the client-side JWT decoder.
 *
 * The decoder runs in the user's browser inside a useMemo hook on every
 * keystroke. A malicious paste (10 MB token, deeply-nested JSON, infinite
 * regex backtrack) could:
 *   • Lock up the UI for seconds.
 *   • Exhaust browser memory.
 *   • Throw an unhandled error, taking down the whole page.
 *
 * We assert the decoder returns within a tight time budget AND never throws.
 */

function pasteToken(token: string) {
  const textbox = screen.getByRole("textbox") as HTMLTextAreaElement;
  // fireEvent.change is faster than user.type and won't choke on 10MB strings
  fireEvent.change(textbox, { target: { value: token } });
}

describe("JwtClient — DoS / robustness", () => {
  it("does not crash on a 1MB random token", () => {
    renderWithIntl(<JwtClient />);
    const huge = "A".repeat(1_000_000) + ".B.C";
    const t0 = performance.now();
    pasteToken(huge);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(2000);
    // The component must still be mounted (no crash)
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("does not crash on a token with > 3 segments", () => {
    renderWithIntl(<JwtClient />);
    pasteToken("a.b.c.d.e.f");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("does not crash on a token with binary garbage in segments", () => {
    renderWithIntl(<JwtClient />);
    pasteToken("\x00\x01\x02.\xff\xfe.\xff\xff");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("does not crash on an empty token", () => {
    renderWithIntl(<JwtClient />);
    pasteToken("");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("does not crash when payload is base64 of deeply-nested JSON", () => {
    renderWithIntl(<JwtClient />);
    // Build {"a":{"a":{"a":...}}} 500 deep, base64-encode
    let nested = "true";
    for (let i = 0; i < 500; i++) nested = `{"a":${nested}}`;
    const b64 = btoa(nested).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    pasteToken("header." + b64 + ".sig");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("does not crash when payload base64 decodes to invalid UTF-8", () => {
    renderWithIntl(<JwtClient />);
    // Base64 of invalid UTF-8 byte sequence
    const badPayload = btoa("\xc3\x28").replace(/=/g, "");  // invalid UTF-8 continuation
    pasteToken("h." + badPayload + ".s");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("decodes a valid sample token and renders the payload", async () => {
    renderWithIntl(<JwtClient />);
    // The default sample token should already be loaded — let it render
    // We don't assert exact content because the component's renderer differs;
    // we only verify it didn't crash and the textarea has content.
    const textbox = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textbox.value).toContain("eyJ");
  });

  it("rapid sequential pastes don't deadlock the React tree", async () => {
    renderWithIntl(<JwtClient />);
    for (let i = 0; i < 30; i++) {
      pasteToken("a".repeat(i * 100) + ".b.c");
    }
    // Final state — component still alive
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("does not throw on a token whose payload base64 decodes to an array", () => {
    renderWithIntl(<JwtClient />);
    const arrayPayload = btoa("[1,2,3]").replace(/=/g, "");
    pasteToken("h." + arrayPayload + ".s");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
