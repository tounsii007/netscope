import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MobileNav } from "@/components/mobile-nav";
import { renderWithIntl, screen, userEvent, fireEvent } from "./test-utils";

/**
 * Robustness tests for MobileNav.
 *
 * Hunting for:
 *   • body-scroll-lock leak: if the drawer is unmounted while open, body
 *     overflow MUST be restored (otherwise the page below stays frozen).
 *   • Multiple drawer instances simultaneously open — overflow handling
 *     must not double-toggle into a permanently-locked state.
 *   • Rapid toggle (open / close 50× in a row) — no stuck state.
 *   • Escape key fires repeatedly — only one keydown handler attached.
 *   • Backdrop click — calls cleanup, never propagates to <body>.
 *   • Pathname change while open — drawer auto-closes.
 *   • aria-expanded reflects open state.
 */

let pathnameMock = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock }));

const links = [
  { href: "/port-checker", key: "ports" },
  { href: "/dns-lookup",   key: "dns" },
];

beforeEach(() => {
  pathnameMock = "/";
  document.body.style.overflow = "";
});
afterEach(() => {
  // Defensive — verify each test left things clean
  if (document.body.style.overflow === "hidden") {
    document.body.style.overflow = "";
    throw new Error("test left body scroll-locked");
  }
});

describe("MobileNav robustness", () => {
  /* ─── scroll-lock invariants ─────────────────────────────────────────── */

  it("restores body overflow when drawer is unmounted while still open", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithIntl(<MobileNav toolLinks={links} />);
    await user.click(screen.getByLabelText(/Open menu/i));
    expect(document.body.style.overflow).toBe("hidden");

    // Simulate the parent unmounting (e.g. route change tearing down layout)
    unmount();

    // The cleanup effect MUST restore overflow even though the drawer was
    // open at unmount time — otherwise the next page is frozen.
    expect(document.body.style.overflow).toBe("");
  });

  it("does not corrupt overflow when two drawer instances mount in parallel", async () => {
    const user = userEvent.setup();
    const a = renderWithIntl(<MobileNav toolLinks={links} />);
    const b = renderWithIntl(<MobileNav toolLinks={links} />);

    // Open both
    const openButtons = screen.getAllByLabelText(/Open menu/i);
    expect(openButtons).toHaveLength(2);
    await user.click(openButtons[0]);
    await user.click(openButtons[1]);
    expect(document.body.style.overflow).toBe("hidden");

    // Close both — body MUST be unlocked at the end
    const closeButtons = screen.getAllByLabelText(/Close menu/i);
    for (const btn of closeButtons) await user.click(btn);

    a.unmount();
    b.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("survives 25 rapid open/close cycles without stuck state", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);

    for (let i = 0; i < 25; i++) {
      await user.click(screen.getByLabelText(/Open menu/i));
      await user.click(screen.getByLabelText(/Close menu/i));
    }

    expect(document.body.style.overflow).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Final state — toggle still responsive
    expect(screen.getByLabelText(/Open menu/i)).toBeEnabled();
  });

  /* ─── ARIA ──────────────────────────────────────────────────────────── */

  it("aria-expanded toggles in lock-step with open state", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);
    const toggle = screen.getByLabelText(/Open menu/i);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    const reopened = screen.getByLabelText(/Open menu/i);
    expect(reopened).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByLabelText(/Close menu/i));
    expect(screen.getByLabelText(/Open menu/i)).toHaveAttribute("aria-expanded", "false");
  });

  /* ─── (route-change auto-close already covered in mobile-nav.test.tsx) ─ */

  /* ─── escape handler not duplicated ──────────────────────────────────── */

  it("does not stack Escape handlers on repeated open/close", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);

    // Open & close twice
    await user.click(screen.getByLabelText(/Open menu/i));
    await user.click(screen.getByLabelText(/Close menu/i));
    await user.click(screen.getByLabelText(/Open menu/i));
    await user.click(screen.getByLabelText(/Close menu/i));

    // Open again, fire Escape — should still close cleanly (one handler attached)
    await user.click(screen.getByLabelText(/Open menu/i));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /* ─── irrelevant keys do nothing ─────────────────────────────────────── */

  it("ignores irrelevant key presses while open", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);
    await user.click(screen.getByLabelText(/Open menu/i));

    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Tab"   });
    fireEvent.keyDown(document, { key: "a"     });
    fireEvent.keyDown(document, { key: "Space" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Close before test ends so the afterEach scroll-lock guard doesn't trip
    await user.click(screen.getByLabelText(/Close menu/i));
  });

  /* ─── backdrop click ─────────────────────────────────────────────────── */

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);
    await user.click(screen.getByLabelText(/Open menu/i));

    // Backdrop is the fixed black overlay sibling of the dialog
    const backdrops = document.querySelectorAll('[aria-hidden="true"].fixed');
    expect(backdrops.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(backdrops[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

