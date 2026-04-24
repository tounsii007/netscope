import { describe, it, expect } from "vitest";
import { api } from "@/lib/api";

describe("api client", () => {
  it("returns open=true for 443", async () => {
    const r = await api.portCheck("example.com", 443);
    expect(r.open).toBe(true);
    expect(r.service).toBe("https");
  });

  it("returns open=false for random port", async () => {
    const r = await api.portCheck("example.com", 12345);
    expect(r.open).toBe(false);
  });

  it("fetches DNS records", async () => {
    const r = await api.dns("example.com");
    expect(r.domain).toBe("example.com");
    expect(r.records.A).toContain("93.184.216.34");
  });
});
