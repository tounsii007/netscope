import { describe, it, expect } from "vitest";
import {
  normaliseHost,
  normaliseRegistrableDomain,
  normaliseUrl,
} from "@/lib/normalise-host";

/**
 * Lock the contract for the three host/URL normalisation helpers.
 * Every tool client funnels user input through one of these — a
 * regression here would cascade across DNS, WHOIS, SSL, IP-Lookup,
 * BGP, Subdomain Finder and the rest.
 */
describe("normaliseHost", () => {
  it("trims whitespace", () => {
    expect(normaliseHost("  example.com  ")).toBe("example.com");
  });

  it("returns empty string for blank or empty input", () => {
    expect(normaliseHost("")).toBe("");
    expect(normaliseHost("   ")).toBe("");
  });

  it("strips a scheme via URL()", () => {
    expect(normaliseHost("https://example.com")).toBe("example.com");
    expect(normaliseHost("HTTP://Example.com")).toBe("example.com");
  });

  it("strips scheme + path + query + hash + port + userinfo", () => {
    expect(normaliseHost("https://user:pass@example.com:8080/foo/bar?q=1#h")).toBe("example.com");
  });

  it("strips path / query / hash from bare hostnames", () => {
    expect(normaliseHost("example.com/foo")).toBe("example.com");
    expect(normaliseHost("example.com?x=1")).toBe("example.com");
    expect(normaliseHost("example.com#frag")).toBe("example.com");
  });

  it("strips a port suffix from a bare hostname", () => {
    expect(normaliseHost("example.com:443")).toBe("example.com");
  });

  it("drops a userinfo prefix on bare hostnames", () => {
    expect(normaliseHost("admin@example.com")).toBe("example.com");
  });

  it("lowercases the result", () => {
    expect(normaliseHost("EXAMPLE.COM")).toBe("example.com");
  });

  it("strips a trailing dot (FQDN canonical form)", () => {
    expect(normaliseHost("example.com.")).toBe("example.com");
  });

  it("preserves IPv4 addresses unchanged", () => {
    expect(normaliseHost("8.8.8.8")).toBe("8.8.8.8");
  });

  it("preserves multi-level subdomains as the user typed them", () => {
    expect(normaliseHost("api.staging.example.com")).toBe("api.staging.example.com");
  });
});

describe("normaliseRegistrableDomain", () => {
  it("strips a leading www. (the most common false precision)", () => {
    expect(normaliseRegistrableDomain("www.example.com")).toBe("example.com");
  });

  it("does NOT strip multi-level subdomains beyond www", () => {
    expect(normaliseRegistrableDomain("api.staging.example.com")).toBe("api.staging.example.com");
  });

  it("composes with normaliseHost — full URL with www. collapses to bare domain", () => {
    expect(normaliseRegistrableDomain("https://www.example.com/foo")).toBe("example.com");
  });

  it("returns empty string for blank input", () => {
    expect(normaliseRegistrableDomain("")).toBe("");
  });
});

describe("normaliseUrl", () => {
  it("trusts a fully-qualified URL", () => {
    expect(normaliseUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
    expect(normaliseUrl("http://example.com")).toBe("http://example.com");
  });

  it("prepends https:// to a bare hostname", () => {
    expect(normaliseUrl("example.com")).toBe("https://example.com");
    expect(normaliseUrl("example.com/foo")).toBe("https://example.com/foo");
  });

  it("returns empty string for blank input", () => {
    expect(normaliseUrl("")).toBe("");
    expect(normaliseUrl("   ")).toBe("");
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(normaliseUrl("  https://example.com  ")).toBe("https://example.com");
    expect(normaliseUrl("  example.com  ")).toBe("https://example.com");
  });

  it("does not double-prepend if the input already has a scheme with mixed case", () => {
    expect(normaliseUrl("HTTPS://example.com")).toBe("HTTPS://example.com");
  });
});
