import { describe, it, expect } from "vitest";
import { splitBullets, safeT } from "@/components/tool-explainer/split-bullets";

describe("splitBullets", () => {
  it("returns [] for empty / whitespace input", () => {
    expect(splitBullets("")).toEqual([]);
    expect(splitBullets("   ")).toEqual([]);
    expect(splitBullets("\n\n\n")).toEqual([]);
  });

  it("splits on newlines", () => {
    expect(splitBullets("one\ntwo\nthree")).toEqual(["one", "two", "three"]);
  });

  it("splits on bullet glyphs", () => {
    expect(splitBullets("one • two • three")).toEqual(["one", "two", "three"]);
  });

  it("splits on legacy double-pipe", () => {
    expect(splitBullets("one||two||three")).toEqual(["one", "two", "three"]);
  });

  it("trims each entry", () => {
    expect(splitBullets("  one\n  two ")).toEqual(["one", "two"]);
  });

  it("drops empty pieces", () => {
    expect(splitBullets("one\n\n\ntwo")).toEqual(["one", "two"]);
  });

  it("keeps mixed separators in the same string", () => {
    expect(splitBullets("one\ntwo • three || four")).toEqual([
      "one", "two", "three", "four",
    ]);
  });
});

describe("safeT", () => {
  it("returns the value when present", () => {
    const t = (k: string) => (k === "yes" ? "hello" : k);
    expect(safeT(t, "yes")).toBe("hello");
  });

  it("returns '' when the translator echoes the key (next-intl miss)", () => {
    const t = (k: string) => k;
    expect(safeT(t, "missing")).toBe("");
  });

  it("returns '' when the value ends with '.<key>' (namespaced miss)", () => {
    const t = () => "tools.foo.bar.missing";
    expect(safeT(t, "missing")).toBe("");
  });

  it("never throws when the translator throws", () => {
    const t = () => { throw new Error("boom"); };
    expect(safeT(t, "x")).toBe("");
  });
});
