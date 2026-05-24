import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton, SkeletonText, SkeletonCard } from "@/components/skeleton";

/**
 * Smoke coverage for the shimmer placeholders. The components are
 * presentational so we mainly assert:
 *   • they actually render (a div with the pulse class)
 *   • SkeletonText emits `lines` rows, last one shorter
 *   • SkeletonCard composes the right primitives + supports count
 *   • every primitive carries aria-hidden so screen readers don't
 *     repeat "loading" once per line
 */

describe("Skeleton primitives", () => {
  it("Skeleton renders one pulsing element", () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.className).toMatch(/animate-pulse/);
    expect(el.className).toMatch(/h-4/);
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("SkeletonText emits the requested number of lines", () => {
    const { container } = render(<SkeletonText lines={5} />);
    // Each line is a Skeleton div under the root wrapper.
    const root = container.firstElementChild as HTMLElement;
    expect(root.children.length).toBe(5);
    // Last line is narrower (w-2/3) so the block reads as a paragraph.
    expect(
      (root.lastElementChild as HTMLElement).className,
    ).toMatch(/w-2\/3/);
  });

  it("SkeletonText defaults to 3 lines", () => {
    const { container } = render(<SkeletonText />);
    expect(container.firstElementChild!.children.length).toBe(3);
  });

  it("SkeletonCard renders N cards when count is given", () => {
    const { container } = render(<SkeletonCard count={4} />);
    // Wrapper is one div; its children are N card-skeletons.
    expect(container.firstElementChild!.children.length).toBe(4);
  });

  it("SkeletonCard root carries aria-hidden", () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstElementChild!.getAttribute("aria-hidden")).toBe("true");
  });
});
