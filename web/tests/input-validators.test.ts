import { describe, it, expect } from "vitest";
import {
  isHostname, isIpv4, isIpv6, isIp, isHostOrIp, isEmail, isHttpUrl,
  validateInput,
} from "@/lib/input-validators";

describe("isHostname", () => {
  it("accepts normal domains", () => {
    expect(isHostname("example.com")).toBe(true);
    expect(isHostname("sub.example.co.uk")).toBe(true);
    expect(isHostname("xn--bcher-kva.example")).toBe(true); // punycode
  });
  it("rejects empty / whitespace / bare label / too long", () => {
    expect(isHostname("")).toBe(false);
    expect(isHostname("nodot")).toBe(false);
    expect(isHostname("a..b")).toBe(false);
    expect(isHostname("-leading.com")).toBe(false);
    expect(isHostname("trailing-.com")).toBe(false);
    expect(isHostname("a".repeat(254) + ".com")).toBe(false);
  });
});

describe("isIpv4", () => {
  it("accepts valid octets", () => {
    expect(isIpv4("0.0.0.0")).toBe(true);
    expect(isIpv4("255.255.255.255")).toBe(true);
    expect(isIpv4("8.8.8.8")).toBe(true);
  });
  it("rejects oversize octets and partial addresses", () => {
    expect(isIpv4("256.0.0.0")).toBe(false);
    expect(isIpv4("1.2.3")).toBe(false);
    expect(isIpv4("1.2.3.4.5")).toBe(false);
    expect(isIpv4("01.02.03.04")).toBe(false); // leading zeros not allowed
  });
});

describe("isIpv6", () => {
  it("accepts canonical forms", () => {
    expect(isIpv6("::1")).toBe(true);
    expect(isIpv6("2001:db8::1")).toBe(true);
    expect(isIpv6("fe80::1ff:fe23:4567:890a")).toBe(true);
  });
  it("rejects multiple :: collapses", () => {
    expect(isIpv6("::1::1")).toBe(false);
  });
  it("rejects letters outside hex range", () => {
    expect(isIpv6("zzzz::1")).toBe(false);
  });
});

describe("isIp / isHostOrIp", () => {
  it("isIp combines v4 + v6", () => {
    expect(isIp("8.8.8.8")).toBe(true);
    expect(isIp("::1")).toBe(true);
    expect(isIp("example.com")).toBe(false);
  });
  it("isHostOrIp accepts both", () => {
    expect(isHostOrIp("example.com")).toBe(true);
    expect(isHostOrIp("8.8.8.8")).toBe(true);
    expect(isHostOrIp("nope")).toBe(false);
  });
});

describe("isEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isEmail("user@example.com")).toBe(true);
    expect(isEmail("first.last+tag@sub.example.co.uk")).toBe(true);
  });
  it("rejects malformed", () => {
    expect(isEmail("not-an-email")).toBe(false);
    expect(isEmail("@example.com")).toBe(false);
    expect(isEmail("user@")).toBe(false);
    expect(isEmail("user@host")).toBe(false); // no TLD
  });
});

describe("isHttpUrl", () => {
  it("accepts http(s) URLs with a hostname", () => {
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl("http://example.com/path?q=1")).toBe(true);
  });
  it("rejects URLs with other schemes", () => {
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });
  it("rejects non-URLs", () => {
    expect(isHttpUrl("not-a-url")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl("://nohost")).toBe(false);
  });
});

describe("validateInput", () => {
  it("returns empty for blank input", () => {
    expect(validateInput("", isHostname).status).toBe("empty");
    expect(validateInput("   ", isHostname).status).toBe("empty");
  });
  it("returns valid for good input", () => {
    expect(validateInput("example.com", isHostname)).toEqual({ status: "valid" });
  });
  it("returns invalid + supplied hint for bad input", () => {
    expect(validateInput("nodot", isHostname, "doesn't look like a hostname")).toEqual({
      status: "invalid",
      hint: "doesn't look like a hostname",
    });
  });
  it("trims before predicate runs", () => {
    expect(validateInput("  example.com  ", isHostname).status).toBe("valid");
  });
});
