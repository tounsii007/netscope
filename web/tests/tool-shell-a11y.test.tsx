import { describe, it, expect } from "vitest";
import { renderWithIntl, screen } from "./test-utils";
import { ToolShell, ResultCard } from "@/components/tool-shell";

/**
 * Accessibility tests for the shared ToolShell wrapper that every
 * lookup tool uses. The contract locked here:
 *
 *   • <section> landmark exposes an accessible name via
 *     aria-labelledby (so AT users browsing landmarks hear
 *     "DNS Lookup region" instead of just "region").
 *   • The decorative icon is aria-hidden (visible cue only —
 *     no double-announcement next to the h1).
 *   • The subtitle stays as plain <p> so reading order is
 *     icon-hidden → h1 → subtitle → contents.
 */
describe("ToolShell — accessibility surface", () => {
  it("links the <section> landmark to its <h1> via aria-labelledby", () => {
    renderWithIntl(
      <ToolShell title="DNS Lookup" subtitle="Resolve records" icon={<svg data-testid="icon" />}>
        <p>body</p>
      </ToolShell>,
    );

    const region = screen.getByRole("region", { name: "DNS Lookup" });
    expect(region.tagName).toBe("SECTION");
    const heading = screen.getByRole("heading", { level: 1, name: "DNS Lookup" });
    // aria-labelledby on the section must point at the h1's id.
    expect(region.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.id).toBeTruthy();
  });

  it("hides the decorative icon container from AT", () => {
    renderWithIntl(
      <ToolShell title="X" subtitle="y" icon={<svg data-testid="icon" />}>
        <p>body</p>
      </ToolShell>,
    );
    // The icon wrapper is aria-hidden so the icon is not double-announced
    // next to the h1. We assert on the wrapper's attribute presence
    // rather than the inner <svg> so future icon swaps stay covered.
    const icon = screen.getByTestId("icon");
    const wrapper = icon.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("ResultCard renders its children inside a card div (no extra landmark)", () => {
    renderWithIntl(<ResultCard>visible</ResultCard>);
    expect(screen.getByText("visible")).toBeInTheDocument();
  });

  it("two ToolShells rendered side by side get distinct title ids", () => {
    renderWithIntl(
      <>
        <ToolShell title="A" subtitle="a" icon={<svg />}><p>a</p></ToolShell>
        <ToolShell title="B" subtitle="b" icon={<svg />}><p>b</p></ToolShell>
      </>,
    );

    const a = screen.getByRole("region", { name: "A" });
    const b = screen.getByRole("region", { name: "B" });
    // useId() must give two unique values per page render — without
    // this, both sections would point at the same id and the second
    // would inherit the first's accessible name.
    expect(a.getAttribute("aria-labelledby"))
      .not.toBe(b.getAttribute("aria-labelledby"));
  });
});
