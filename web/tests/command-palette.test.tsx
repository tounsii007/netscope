import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { renderWithIntl, screen, userEvent } from "./test-utils";

/**
 * Coverage for the Cmd+K command palette. We mock next/navigation
 * because the palette pushes routes and reads usePathname.
 */

const pushMock = vi.fn();
let pathnameMock = "/port-checker";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => pathnameMock,
}));

beforeEach(() => {
  pushMock.mockReset();
  pathnameMock = "/port-checker";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CommandPalette", () => {
  it("renders the launcher button with the keyboard hint", () => {
    renderWithIntl(<CommandPalette />);
    const launcher = screen.getByRole("button", { name: /open search/i });
    expect(launcher).toBeInTheDocument();
    // Contains the ⌘ K kbd hint
    expect(launcher.textContent).toMatch(/⌘/);
    expect(launcher.textContent).toMatch(/K/);
  });

  it("opens the dialog when the launcher is clicked", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens on Cmd+K (meta key)", async () => {
    renderWithIntl(<CommandPalette />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens on Ctrl+K", async () => {
    renderWithIntl(<CommandPalette />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("opens on '/' when no input is focused", async () => {
    renderWithIntl(<CommandPalette />);
    fireEvent.keyDown(window, { key: "/" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("filters tools by typing in the search box", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /open search/i }));

    const input = await screen.findByPlaceholderText(/Search tools/i);
    await user.type(input, "ssl");

    // The "SSL" tool should be in the list, but unrelated ones shouldn't.
    const options = screen.getAllByRole("option");
    const labels = options.map((o) => o.textContent ?? "");
    expect(labels.some((l) => /ssl/i.test(l))).toBe(true);
    expect(labels.every((l) => !/^Cookies/i.test(l))).toBe(true);
  });

  it("shows the empty state when no tools match", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /open search/i }));

    const input = await screen.findByPlaceholderText(/Search tools/i);
    await user.type(input, "zzzzz-no-match");

    expect(screen.getByText(/No matching tools/i)).toBeInTheDocument();
  });

  it("navigates on Enter to the active option", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /open search/i }));

    const input = await screen.findByPlaceholderText(/Search tools/i);
    await user.type(input, "ssl");

    // ArrowDown then Enter selects the first/second result; we just
    // confirm router.push got called with /ssl-check (the SSL tool).
    fireEvent.keyDown(input, { key: "Enter" });
    expect(pushMock).toHaveBeenCalled();
    const pushedTarget = String(pushMock.mock.calls[0]?.[0] ?? "");
    expect(pushedTarget).toMatch(/ssl-check/);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CommandPalette />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    const input = await screen.findByPlaceholderText(/Search tools/i);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
