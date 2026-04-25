import { describe, it, expect } from "vitest";
import { api } from "@/lib/api";

/**
 * Extra coverage for the lib/api client beyond the existing api.test.ts.
 * These hit the MSW handlers added in tests/setup.ts.
 */
describe("api client (extra endpoints)", () => {
  it("portScan returns aggregate counts and per-port results", async () => {
    const r = await api.portScan("google.com", { commonOnly: true });
    expect(r.target).toBe("google.com");
    expect(r.openCount).toBe(2);
    expect(r.totalChecked).toBe(20);
    expect(r.results).toHaveLength(3);
    expect(r.results.find((p) => p.port === 443)?.open).toBe(true);
    expect(r.results.find((p) => p.port === 22)?.open).toBe(false);
  });

  it("whois returns domain ownership data", async () => {
    const r = await api.whois("cloudflare.com");
    expect(r.domain).toBe("cloudflare.com");
    expect(r.registrar).toBe("Acme Registrar Inc.");
    expect(r.nameservers).toContain("ns1.acme.example");
    expect(r.status).toContain("clientTransferProhibited");
  });

  it("robots returns robots.txt and sitemap data", async () => {
    const r = await api.robots("github.com");
    expect(r.robots.status).toBe(200);
    expect(r.sitemaps?.[0]?.url).toMatch(/sitemap\.xml/);
  });

  it("dns returns A and NS records", async () => {
    const r = await api.dns("example.com");
    expect(r.records.A).toEqual(["93.184.216.34"]);
    expect(r.records.NS).toContain("a.iana-servers.net.");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
});
