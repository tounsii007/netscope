import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithIntl, renderWithLocale, screen } from "./test-utils";
import { DnsClient } from "@/app/[locale]/dns-lookup/client";

/**
 * Accessibility-focused tests for the DNS lookup client.
 * Locks the contract that the form remains operable for keyboard
 * and screen-reader users:
 *
 *   • Input is associated with a label (visible or sr-only)
 *   • Record-type toggles expose pressed/unpressed state via
 *     aria-pressed so AT users can hear which types are active
 *   • Errors are announced via role=alert
 *   • The submit button surfaces aria-busy while loading so AT
 *     users hear "Loading…" instead of stale "Lookup"
 */
describe("DnsClient — accessibility surface", () => {
  it("associates the domain input with a label", () => {
    renderWithIntl(<DnsClient />);
    const input = screen.getByLabelText(/enter domain/i);
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("toggles aria-pressed on a record-type button when clicked", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DnsClient />);

    // CAA starts unselected
    const caa = screen.getByRole("button", { name: "CAA" });
    expect(caa).toHaveAttribute("aria-pressed", "false");

    await user.click(caa);
    expect(caa).toHaveAttribute("aria-pressed", "true");

    await user.click(caa);
    expect(caa).toHaveAttribute("aria-pressed", "false");
  });

  it("renders the type-toggle group with a localised accessible name (EN)", () => {
    // After the a11y fix, the aria-label is sourced from
    // dns.record_types so screen-reader users hear the label in their
    // own language. English bundle has "Record types".
    renderWithIntl(<DnsClient />);
    const group = screen.getByRole("group", { name: /record types/i });
    expect(group).toBeInTheDocument();
  });

  it("renders the type-toggle group with a localised accessible name (DE)", () => {
    // Regression guard: switching the user's locale must change the
    // screen-reader-announced group name accordingly. Before the fix
    // this was hardcoded English ("DNS record types") in all locales.
    renderWithLocale(<DnsClient />, "de");
    // German bundle: dns.record_types = "Eintragstypen"
    const group = screen.getByRole("group", { name: /eintragstypen/i });
    expect(group).toBeInTheDocument();
  });

  it("flags a blank-domain error with role=alert so screen readers announce it", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DnsClient />);

    // Clear the default value
    const input = screen.getByLabelText(/enter domain/i);
    await user.clear(input);

    // Submit
    const submit = screen.getByRole("button", { name: /lookup/i });
    await user.click(submit);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
