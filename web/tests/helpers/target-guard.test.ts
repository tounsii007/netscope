import { describe, it, expect } from "vitest";
import { checkTargetGuard, type GuardReasonKey } from "@/lib/target-guard";

/**
 * Defense-in-depth target guard. Locks the contract that every input the
 * backend's TargetValidator would reject is also rejected client-side.
 * Each rejection carries a translation key so the UI can show a precise,
 * localised message instead of the generic "forbidden" the API returns.
 */

function reasonOf(input: string): GuardReasonKey | "ok" {
  const r = checkTargetGuard(input);
  return r.ok ? "ok" : r.reasonKey;
}

describe("checkTargetGuard — public hostnames pass", () => {
  it.each([
    "example.com",
    "GOOGLE.COM",
    "https://example.com/path?q=1#h",
    "a.b.c.example.org",
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",       // Cloudflare DNS
    "2001:4860:4860::8888",       // Google DNS
    "example.com:8443",           // public host with port
    "example.com.",               // canonical FQDN dot
  ])("%s passes", (input) => {
    expect(reasonOf(input)).toBe("ok");
  });
});

describe("checkTargetGuard — localhost names", () => {
  it.each([
    "localhost",
    "LOCALHOST",
    "  localhost  ",
    "http://localhost",
    "https://localhost:3000/foo",
    "ip6-localhost",
    "ip6-loopback",
    "broadcasthost",
    "foo.localhost",
    "deeper.foo.localhost",
  ])("blocks %s", (input) => {
    expect(reasonOf(input)).toBe("blocked_localhost");
  });
});

describe("checkTargetGuard — IPv4 loopback / private / link-local", () => {
  it.each([
    ["127.0.0.1",        "blocked_localhost"],
    ["127.255.255.254",  "blocked_localhost"],
    ["10.0.0.1",         "blocked_private"],
    ["10.255.255.255",   "blocked_private"],
    ["172.16.0.1",       "blocked_private"],
    ["172.31.255.255",   "blocked_private"],
    ["192.168.1.1",      "blocked_private"],
    ["192.168.255.255",  "blocked_private"],
    ["169.254.0.1",      "blocked_link_local"],
    ["169.254.169.254",  "blocked_metadata"],   // metadata wins over link-local label
    ["100.64.0.1",       "blocked_private"],   // CGNAT
    ["0.0.0.0",          "blocked_private"],
    ["224.0.0.1",        "blocked_private"],   // multicast
    ["240.0.0.1",        "blocked_private"],   // reserved
  ])("classifies %s as %s", (input, reason) => {
    expect(reasonOf(input)).toBe(reason);
  });
});

describe("checkTargetGuard — IPv6 loopback / link-local / ULA", () => {
  it.each([
    ["::1",              "blocked_localhost"],
    ["::",               "blocked_localhost"],
    ["fe80::1",          "blocked_link_local"],
    ["fe80::abcd:1234",  "blocked_link_local"],
    ["fc00::1",          "blocked_private"],
    ["fd00::ff",         "blocked_private"],
    ["::ffff:127.0.0.1", "blocked_localhost"],   // IPv4-mapped loopback
    ["::ffff:10.0.0.1",  "blocked_private"],
  ])("classifies %s as %s", (input, reason) => {
    expect(reasonOf(input)).toBe(reason);
  });
});

describe("checkTargetGuard — cloud metadata", () => {
  it.each([
    "169.254.169.254",     // AWS / GCP / Azure / DO / Oracle
    "100.100.100.200",     // Alibaba
    "192.0.0.192",         // Oracle legacy
  ])("blocks %s as metadata", (input) => {
    expect(reasonOf(input)).toBe("blocked_metadata");
  });
});

describe("checkTargetGuard — RFC 6761 / convention TLDs", () => {
  it.each([
    "router.local",
    "myhost.test",
    "fixture.invalid",
    "anything.example",
    "intranet.internal",
    "files.lan",
    "nas.home",
    "wiki.corp",
  ])("blocks %s as reserved TLD", (input) => {
    expect(reasonOf(input)).toBe("blocked_reserved_tld");
  });

  it("does NOT block real example.com / example.org / example.net (they're public domains)", () => {
    expect(reasonOf("example.com")).toBe("ok");
    expect(reasonOf("example.org")).toBe("ok");
    expect(reasonOf("example.net")).toBe("ok");
  });
});

describe("checkTargetGuard — empty / malformed input", () => {
  it.each([
    ["", "invalid_target"],
    ["   ", "invalid_target"],
    ["://", "invalid_target"],
  ])("treats %s as invalid_target", (input, reason) => {
    expect(reasonOf(input)).toBe(reason);
  });
});

describe("checkTargetGuard — strips userinfo / port / path BEFORE classifying", () => {
  it("blocks user:pass@127.0.0.1:8080 as localhost", () => {
    expect(reasonOf("user:pass@127.0.0.1:8080")).toBe("blocked_localhost");
  });

  it("blocks https://[::1]:8443/path as localhost", () => {
    expect(reasonOf("https://[::1]:8443/path")).toBe("blocked_localhost");
  });
});
