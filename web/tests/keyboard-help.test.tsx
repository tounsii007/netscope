import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import { KeyboardHelp } from "@/components/command-palette/keyboard-help";
import { renderWithIntl, screen } from "./test-utils";

/**
 * Coverage for the `?` keyboard-help cheat-sheet modal.
 *
 * The component owns nothing besides its open state; the behaviour we
 * care about:
 *   • starts closed (nothing in the DOM)
 *   • opens on `?` when no input is focused
 *   • does NOT open on `?` typed inside an input/textarea
 *   • closes on Escape
 *   • closes on the X button
 */

describe("KeyboardHelp", () => {
  it("renders nothing initially", () => {
    renderWithIntl(<KeyboardHelp />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens when the user presses `?` outside an input", async () => {
    renderWithIntl(<KeyboardHelp />);
    fireEvent.keyDown(window, { key: "?" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Lists the four canonical shortcuts.
    expect(screen.getByText(/Search tools/i)).toBeInTheDocument();
    expect(screen.getByText(/Quick search/i)).toBeInTheDocument();
    expect(screen.getByText(/Show this dialog/i)).toBeInTheDocument();
  });

  it("does NOT open when `?` is typed inside an input", () => {
    renderWithIntl(
      <div>
        <input data-testid="x" />
        <KeyboardHelp />
      </div>,
    );
    const input = screen.getByTestId("x") as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: "?" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    renderWithIntl(<KeyboardHelp />);
    fireEvent.keyDown(window, { key: "?" });
    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the X button is clicked", async () => {
    renderWithIntl(<KeyboardHelp />);
    fireEvent.keyDown(window, { key: "?" });
    await screen.findByRole("dialog");
    // Two buttons render with the same label (overlay + X). Pick the X
    // which is the one inside the dialog header.
    const close = screen.getAllByLabelText(/close/i).find(
      (b) => b.tagName === "BUTTON" && b.querySelector("svg"),
    );
    expect(close).toBeDefined();
    fireEvent.click(close!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
