import { describe, it, expect, vi, beforeEach } from "vitest";
import { MobileNav } from "@/components/mobile-nav";
import { renderWithIntl, renderWithLocale, screen, userEvent, fireEvent } from "./test-utils";

let pathnameMock = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock }));

const links = [
  { href: "/port-checker", key: "ports" },
  { href: "/dns-lookup",   key: "dns" },
  { href: "/whois",        key: "whois" },
];

beforeEach(() => { pathnameMock = "/"; });

describe("MobileNav", () => {
  it("renders the menu toggle with translated aria-label", () => {
    renderWithIntl(<MobileNav toolLinks={links} />);
    expect(screen.getByLabelText(/Open menu/i)).toBeInTheDocument();
    // Drawer hidden by default
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the drawer with the tool list on click", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);
    await user.click(screen.getByLabelText(/Open menu/i));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");

    expect(screen.getByRole("link", { name: /Ports/ })).toHaveAttribute("href", "/port-checker");
    expect(screen.getByRole("link", { name: /DNS/   })).toHaveAttribute("href", "/dns-lookup");
    expect(screen.getByRole("link", { name: /WHOIS/ })).toHaveAttribute("href", "/whois");
  });

  it("closes via the close button", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);
    await user.click(screen.getByLabelText(/Open menu/i));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Close menu/i));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape key", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);
    await user.click(screen.getByLabelText(/Open menu/i));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("highlights the active route", async () => {
    pathnameMock = "/port-checker";
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);
    await user.click(screen.getByLabelText(/Open menu/i));
    const active = screen.getByRole("link", { name: /Ports/ });
    expect(active.className).toMatch(/text-brand/);
  });

  it("renders translated labels in German", async () => {
    const user = userEvent.setup();
    renderWithLocale(<MobileNav toolLinks={links} />, "de");
    await user.click(screen.getByLabelText(/Menü öffnen/i));
    expect(screen.getByText(/Werkzeuge/)).toBeInTheDocument();
  });

  it("locks body scroll while open and restores on close", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MobileNav toolLinks={links} />);
    expect(document.body.style.overflow).toBe("");

    await user.click(screen.getByLabelText(/Open menu/i));
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByLabelText(/Close menu/i));
    expect(document.body.style.overflow).toBe("");
  });
});
