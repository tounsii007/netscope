import { describe, it, expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { RecentTargets } from "@/components/recent-targets";
import { renderWithIntl, screen } from "./test-utils";

describe("RecentTargets", () => {
  it("renders nothing when the list is empty", () => {
    const { container } = renderWithIntl(
      <RecentTargets recent={[]} onPick={() => {}} onForget={() => {}} />,
    );
    // The toast viewport from the provider always mounts, so we check
    // specifically that none of OUR chips landed in the tree.
    expect(container.querySelector("[aria-label*='Recent']")).toBeNull();
    expect(container.querySelector('button[aria-label*="Forget"]')).toBeNull();
  });

  it("renders one chip per entry with the value visible", () => {
    renderWithIntl(
      <RecentTargets
        recent={["one.com", "two.com", "three.com"]}
        onPick={() => {}}
        onForget={() => {}}
      />,
    );
    expect(screen.getByText("one.com")).toBeInTheDocument();
    expect(screen.getByText("two.com")).toBeInTheDocument();
    expect(screen.getByText("three.com")).toBeInTheDocument();
  });

  it("calls onPick when the chip body is clicked", () => {
    const onPick = vi.fn();
    renderWithIntl(
      <RecentTargets
        recent={["pick-me.com"]}
        onPick={onPick}
        onForget={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("pick-me.com"));
    expect(onPick).toHaveBeenCalledWith("pick-me.com");
  });

  it("calls onForget when the chip X is clicked", () => {
    const onForget = vi.fn();
    renderWithIntl(
      <RecentTargets
        recent={["drop-me.com"]}
        onPick={() => {}}
        onForget={onForget}
      />,
    );
    // The forget button has aria-label "Forget drop-me.com" (ICU
    // template renders the value into the label).
    fireEvent.click(screen.getByLabelText(/forget.+drop-me\.com/i));
    expect(onForget).toHaveBeenCalledWith("drop-me.com");
  });
});
