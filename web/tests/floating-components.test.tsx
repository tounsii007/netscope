import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { ScrollProgress } from "@/components/floating/scroll-progress";
import { BackToTop } from "@/components/floating/back-to-top";
import { renderWithIntl, screen } from "./test-utils";

/**
 * Coverage for the floating widgets mounted in the locale layout.
 *
 * ScrollProgress is a tiny client component — we just verify it
 * renders a non-null tree when reduce-motion isn't set, and renders
 * nothing when it is.
 *
 * BackToTop uses translations + scrollY threshold + scrollTo, all of
 * which work in jsdom with a bit of stubbing.
 */

const matchMediaMock = vi.fn();

beforeEach(() => {
  // Default: motion NOT reduced (so ScrollProgress renders).
  matchMediaMock.mockReset();
  matchMediaMock.mockImplementation((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: matchMediaMock,
  });

  // Stub scrollTo (jsdom doesn't implement it).
  window.scrollTo = vi.fn();
  // Reset scrollY.
  Object.defineProperty(window, "scrollY", {
    writable: true,
    configurable: true,
    value: 0,
  });
  // Stub documentElement.scrollHeight so the progress math doesn't divide by zero.
  Object.defineProperty(document.documentElement, "scrollHeight", {
    writable: true,
    configurable: true,
    value: 2000,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScrollProgress", () => {
  it("renders the gradient bar when motion is not reduced", () => {
    const { container } = renderWithIntl(<ScrollProgress />);
    // outer wrapper carries aria-hidden + the gradient class on the inner.
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(container.innerHTML).toMatch(/from-brand/);
  });

  it("renders nothing when prefers-reduced-motion is set", () => {
    matchMediaMock.mockImplementation((q: string) => ({
      matches: true,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const { container } = renderWithIntl(<ScrollProgress />);
    expect(container.firstChild).toBeNull();
  });

  it("updates the bar transform when the user scrolls", () => {
    const { container } = renderWithIntl(<ScrollProgress />);
    // window.scrollY is 0 initially → scaleX(0)
    // scrollHeight 2000, innerHeight ~768 in jsdom → docHeight ≈ 1232.
    // Scrolling to 616 should put progress around 50%.
    Object.defineProperty(window, "scrollY", { value: 1000, writable: true });
    fireEvent.scroll(window);
    const inner = container.querySelector("[style*='scaleX']") as HTMLElement | null;
    expect(inner).not.toBeNull();
    // We don't assert the exact number — jsdom's innerHeight isn't fixed —
    // just that the scaleX value moved past 0.
    expect(inner!.style.transform).toMatch(/scaleX\(0\.[1-9]/);
  });
});

describe("BackToTop", () => {
  it("renders the button with the translated aria-label", () => {
    renderWithIntl(<BackToTop />);
    expect(screen.getByRole("button", { name: /Back to top/i })).toBeInTheDocument();
  });

  it("is hidden (opacity-0) until the user scrolls past the threshold", () => {
    renderWithIntl(<BackToTop />);
    const btn = screen.getByRole("button", { name: /Back to top/i });
    expect(btn.className).toMatch(/opacity-0/);

    Object.defineProperty(window, "scrollY", { value: 800, writable: true });
    fireEvent.scroll(window);
    expect(btn.className).toMatch(/opacity-100/);
  });

  it("scrolls to top when clicked", () => {
    renderWithIntl(<BackToTop />);
    const btn = screen.getByRole("button", { name: /Back to top/i });
    fireEvent.click(btn);
    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    );
  });
});
