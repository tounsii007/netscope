import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { highlight } from "@/app/[locale]/subdomains/highlight";

/**
 * The `highlight` helper takes a string and returns either the original
 * string (when no needle) or a fragment of <mark> spans wrapping each
 * case-insensitive occurrence. We test by rendering through React
 * Testing Library and asserting on the DOM.
 */
describe("highlight()", () => {
  it("returns the raw string when needle is empty", () => {
    expect(highlight("hello.example.com", "")).toBe("hello.example.com");
    expect(highlight("hello.example.com", "   ")).toBe("hello.example.com");
  });

  it("wraps a single match in <mark>", () => {
    const { container } = render(<>{highlight("api.example.com", "example")}</>);
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("example");
    expect(container.textContent).toBe("api.example.com");
  });

  it("matches case-insensitively but preserves source casing", () => {
    const { container } = render(<>{highlight("API.Example.COM", "example")}</>);
    const mark = container.querySelector("mark")!;
    expect(mark.textContent).toBe("Example"); // original casing preserved
  });

  it("highlights every occurrence", () => {
    const { container } = render(<>{highlight("foo.foo.foo.com", "foo")}</>);
    expect(container.querySelectorAll("mark")).toHaveLength(3);
  });

  it("survives the needle being a regex meta-character", () => {
    // The implementation does a literal indexOf, so dots etc. are safe.
    const { container } = render(<>{highlight("a.b.c.example", ".")}</>);
    expect(container.querySelectorAll("mark").length).toBeGreaterThan(0);
  });

  it("doesn't crash when the needle is longer than the haystack", () => {
    expect(() => render(<>{highlight("ab", "abcdef")}</>)).not.toThrow();
  });
});
