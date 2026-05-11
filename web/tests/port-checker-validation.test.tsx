import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "./test-utils";
import { PortCheckerClient } from "@/app/[locale]/port-checker/client";

/**
 * Client-side validation now guards the port checker against the
 * three accidental footguns we used to hand straight to the backend:
 *
 *   • single port outside 1-65535 → would 422 with no UX feedback
 *   • range start > end           → would 422
 *   • range over 1024 ports wide  → fires hundreds of upstream RPCs
 *
 * Each shows a localised error in role=alert without making the
 * round-trip. These tests lock that behaviour.
 */
describe("PortCheckerClient — input validation", () => {
  it("blocks a port outside 1-65535 in single mode", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PortCheckerClient />);

    const portInput = screen.getByLabelText(/^port$/i) as HTMLInputElement;
    await user.clear(portInput);
    await user.type(portInput, "70000");

    await user.click(screen.getByRole("button", { name: /check/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/65535/);
  });

  it("blocks a range where start > end", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PortCheckerClient />);

    await user.click(screen.getByRole("button", { name: /port range/i }));

    const fromInput = screen.getByLabelText(/from port/i) as HTMLInputElement;
    const toInput = screen.getByLabelText(/to port/i) as HTMLInputElement;
    await user.clear(fromInput);
    await user.type(fromInput, "500");
    await user.clear(toInput);
    await user.type(toInput, "100");

    await user.click(screen.getByRole("button", { name: /check/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/end|≤/i);
  });

  it("blocks a range wider than 1024 ports", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PortCheckerClient />);

    await user.click(screen.getByRole("button", { name: /port range/i }));

    const fromInput = screen.getByLabelText(/from port/i) as HTMLInputElement;
    const toInput = screen.getByLabelText(/to port/i) as HTMLInputElement;
    await user.clear(fromInput);
    await user.type(fromInput, "1");
    await user.clear(toInput);
    await user.type(toInput, "10000");

    await user.click(screen.getByRole("button", { name: /check/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/1024/);
  });
});
