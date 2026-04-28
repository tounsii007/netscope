import { describe, it, expect } from "vitest";
import { suggestTool } from "@/lib/not-found/suggest-tool";

describe("suggestTool", () => {
  it("returns null for empty / too-short input", () => {
    expect(suggestTool("")).toBeNull();
    expect(suggestTool("a")).toBeNull();
  });

  it("strips non-slug characters before matching", () => {
    expect(suggestTool("port-checker!!!")?.href).toBe("/port-checker");
    expect(suggestTool("ip lookup")?.href).toBe("/ip-lookup");
  });

  it("suggests the closest tool for an exact slug", () => {
    expect(suggestTool("ip-lookup")?.href).toBe("/ip-lookup");
    expect(suggestTool("port-checker")?.href).toBe("/port-checker");
    expect(suggestTool("dnssec")?.href).toBe("/dnssec");
  });

  it("suggests the closest tool for plausible typos", () => {
    expect(suggestTool("port-cheker")?.href).toBe("/port-checker");
    expect(suggestTool("dns-loop")?.href).toBe("/dns-lookup");
    expect(suggestTool("ip-lookupjsdoijsfukfu")?.href).toBe("/ip-lookup");
  });

  it("returns null for clearly unrelated queries (no false positives)", () => {
    expect(suggestTool("totally-unrelated-thing-here")).toBeNull();
    expect(suggestTool("my-favorite-cat-pictures-blog")).toBeNull();
  });

  it("returns a result, not null, for short typos near a slug", () => {
    // "jwt" is only 3 chars; "jwts" should still suggest /jwt.
    expect(suggestTool("jwts")?.href).toBe("/jwt");
  });

  it("stays case-insensitive", () => {
    expect(suggestTool("IP-LOOKUP")?.href).toBe("/ip-lookup");
    expect(suggestTool("Port-Checker")?.href).toBe("/port-checker");
  });
});
