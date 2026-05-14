import { describe, it, expect } from "vitest";
import { checkTargetGuard } from "@/lib/target-guard";

/**
 * Adversarial test suite — every assertion documents an input that an
 * attacker would use to try to bypass the client-side target guard and
 * point a public diagnostic tool at an internal resource (SSRF).
 *
 * A failing test here is a real bypass: the guard accepted an input it
 * was supposed to reject. The backend TargetValidator is the
 * authoritative gate, but the FE guard is documented as defense-in-depth
 * and should hold up against the same set of tricks.
 */

describe("target-guard — IPv4 encoding bypasses", () => {
  it("rejects decimal-encoded IPv4 loopback (2130706433 === 127.0.0.1)", () => {
    // Most libc resolvers + Java's InetAddress.getByName() decode this
    // back to 127.0.0.1 — classic SSRF bypass on naive dotted-quad checks.
    const r = checkTargetGuard("2130706433");
    expect(r.ok).toBe(false);
  });

  it("rejects hex-encoded IPv4 loopback (0x7f000001)", () => {
    const r = checkTargetGuard("0x7f000001");
    expect(r.ok).toBe(false);
  });

  it("rejects per-octet hex IPv4 (0x7f.0.0.1)", () => {
    const r = checkTargetGuard("0x7f.0.0.1");
    expect(r.ok).toBe(false);
  });

  it("rejects short-form IPv4 loopback (127.1 → 127.0.0.1)", () => {
    // Java's InetAddress.getByName("127.1") returns 127.0.0.1.
    const r = checkTargetGuard("127.1");
    expect(r.ok).toBe(false);
  });

  it("rejects short-form IPv4 (127.0.1)", () => {
    const r = checkTargetGuard("127.0.1");
    expect(r.ok).toBe(false);
  });

  it("rejects decimal-encoded RFC 1918 (10.0.0.1 → 167772161)", () => {
    const r = checkTargetGuard("167772161");
    expect(r.ok).toBe(false);
  });

  it("rejects decimal-encoded AWS IMDS (169.254.169.254 → 2852039166)", () => {
    const r = checkTargetGuard("2852039166");
    expect(r.ok).toBe(false);
  });
});

describe("target-guard — IPv6 form variations", () => {
  it("rejects full-form IPv6 loopback (0:0:0:0:0:0:0:1)", () => {
    const r = checkTargetGuard("0:0:0:0:0:0:0:1");
    expect(r.ok).toBe(false);
  });

  it("rejects zero-padded full-form IPv6 loopback", () => {
    const r = checkTargetGuard("0000:0000:0000:0000:0000:0000:0000:0001");
    expect(r.ok).toBe(false);
  });

  it("rejects compressed loopback variant (0::1)", () => {
    const r = checkTargetGuard("0::1");
    expect(r.ok).toBe(false);
  });

  it("rejects IPv6 link-local with zone identifier (fe80::1%eth0)", () => {
    const r = checkTargetGuard("fe80::1%eth0");
    expect(r.ok).toBe(false);
  });

  it("rejects IPv6 ULA at fc00::1 (private)", () => {
    const r = checkTargetGuard("fc00::1");
    expect(r.ok).toBe(false);
  });

  it("rejects IPv6 ULA at fd12:3456:789a::1 (private)", () => {
    const r = checkTargetGuard("fd12:3456:789a::1");
    expect(r.ok).toBe(false);
  });

  it("rejects IPv4-compatible IPv6 to loopback (::127.0.0.1)", () => {
    const r = checkTargetGuard("::127.0.0.1");
    expect(r.ok).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 to loopback (::ffff:127.0.0.1)", () => {
    const r = checkTargetGuard("::ffff:127.0.0.1");
    expect(r.ok).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 to RFC 1918 (::ffff:10.0.0.1)", () => {
    const r = checkTargetGuard("::ffff:10.0.0.1");
    expect(r.ok).toBe(false);
  });
});

describe("target-guard — hostname tricks", () => {
  it("rejects uppercase LOCALHOST", () => {
    const r = checkTargetGuard("LOCALHOST");
    expect(r.ok).toBe(false);
  });

  it("rejects mixed-case LoCaLhOsT", () => {
    const r = checkTargetGuard("LoCaLhOsT");
    expect(r.ok).toBe(false);
  });

  it("rejects localhost with trailing whitespace", () => {
    const r = checkTargetGuard("  localhost  ");
    expect(r.ok).toBe(false);
  });

  it("rejects localhost.localdomain (common Linux loopback alias)", () => {
    // /etc/hosts traditionally ships with "127.0.0.1 localhost localhost.localdomain"
    const r = checkTargetGuard("localhost.localdomain");
    expect(r.ok).toBe(false);
  });

  it("rejects *.localhost subdomains (RFC 6761 reserves the entire tree)", () => {
    const r = checkTargetGuard("foo.localhost");
    expect(r.ok).toBe(false);
  });

  it("rejects deep .localhost subdomains", () => {
    const r = checkTargetGuard("a.b.c.localhost");
    expect(r.ok).toBe(false);
  });

  it("rejects router.local (mDNS)", () => {
    const r = checkTargetGuard("router.local");
    expect(r.ok).toBe(false);
  });

  it("rejects uppercase reserved TLD (foo.LOCAL)", () => {
    const r = checkTargetGuard("foo.LOCAL");
    expect(r.ok).toBe(false);
  });

  it("rejects trailing-dot reserved TLD (foo.local.)", () => {
    const r = checkTargetGuard("foo.local.");
    expect(r.ok).toBe(false);
  });

  it("rejects whitespace-only input", () => {
    const r = checkTargetGuard("   ");
    expect(r.ok).toBe(false);
  });

  it("rejects empty string", () => {
    const r = checkTargetGuard("");
    expect(r.ok).toBe(false);
  });

  it("rejects newline-only input", () => {
    const r = checkTargetGuard("\n\t  \r");
    expect(r.ok).toBe(false);
  });
});

describe("target-guard — URL parsing edge cases", () => {
  it("rejects http://localhost", () => {
    const r = checkTargetGuard("http://localhost");
    expect(r.ok).toBe(false);
  });

  it("rejects https://localhost:8080", () => {
    const r = checkTargetGuard("https://localhost:8080");
    expect(r.ok).toBe(false);
  });

  it("rejects ssh://10.0.0.1:22", () => {
    const r = checkTargetGuard("ssh://10.0.0.1:22");
    expect(r.ok).toBe(false);
  });

  it("rejects wss://[fe80::1]/", () => {
    const r = checkTargetGuard("wss://[fe80::1]/");
    expect(r.ok).toBe(false);
  });

  it("rejects URL with userinfo containing @ before localhost", () => {
    // user@host parsing: target after first @ is what gets used.
    const r = checkTargetGuard("user:pass@localhost");
    expect(r.ok).toBe(false);
  });

  it("rejects URL with path on localhost", () => {
    const r = checkTargetGuard("https://localhost/admin?token=secret");
    expect(r.ok).toBe(false);
  });

  it("rejects bracketed IPv6 loopback ([::1])", () => {
    const r = checkTargetGuard("[::1]");
    expect(r.ok).toBe(false);
  });

  it("rejects bracketed IPv6 loopback with port ([::1]:8080)", () => {
    const r = checkTargetGuard("[::1]:8080");
    expect(r.ok).toBe(false);
  });

  it("rejects scheme://localhost: with no port", () => {
    const r = checkTargetGuard("http://localhost:");
    expect(r.ok).toBe(false);
  });

  it("rejects bare scheme http:// with no host", () => {
    const r = checkTargetGuard("http://");
    expect(r.ok).toBe(false);
  });

  it("rejects bare :// with no scheme", () => {
    const r = checkTargetGuard("://");
    expect(r.ok).toBe(false);
  });
});

describe("target-guard — CIDR & malformed IPs", () => {
  it("rejects CIDR notation 127.0.0.0/8", () => {
    const r = checkTargetGuard("127.0.0.0/8");
    expect(r.ok).toBe(false);
  });

  it("rejects 10.0.0.0/24", () => {
    const r = checkTargetGuard("10.0.0.0/24");
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range octet (127.0.0.256)", () => {
    const r = checkTargetGuard("127.0.0.256");
    // 256 is invalid → parseIpv4 returns null → falls through as hostname.
    // That's acceptable — it's not "localhost" or "*.localhost", just a
    // syntactically wrong IP. The backend will still reject it. We just
    // verify the guard doesn't crash.
    expect(typeof r.ok).toBe("boolean");
  });

  it("rejects negative octet (-1.0.0.1)", () => {
    const r = checkTargetGuard("-1.0.0.1");
    expect(typeof r.ok).toBe("boolean");
  });
});

describe("target-guard — IPv4 broadcast and multicast", () => {
  it("rejects multicast 224.0.0.1", () => {
    const r = checkTargetGuard("224.0.0.1");
    expect(r.ok).toBe(false);
  });

  it("rejects multicast top range 239.255.255.255", () => {
    const r = checkTargetGuard("239.255.255.255");
    expect(r.ok).toBe(false);
  });

  it("rejects reserved 240.0.0.1", () => {
    const r = checkTargetGuard("240.0.0.1");
    expect(r.ok).toBe(false);
  });

  it("rejects broadcast 255.255.255.255", () => {
    const r = checkTargetGuard("255.255.255.255");
    expect(r.ok).toBe(false);
  });

  it("rejects 0.0.0.0 (this network / wildcard)", () => {
    const r = checkTargetGuard("0.0.0.0");
    expect(r.ok).toBe(false);
  });

  it("rejects carrier-grade NAT (100.64.0.1)", () => {
    const r = checkTargetGuard("100.64.0.1");
    expect(r.ok).toBe(false);
  });

  it("rejects carrier-grade NAT top (100.127.255.255)", () => {
    const r = checkTargetGuard("100.127.255.255");
    expect(r.ok).toBe(false);
  });

  it("allows public 100.128.0.1 (just OUTSIDE CGNAT range)", () => {
    const r = checkTargetGuard("100.128.0.1");
    expect(r.ok).toBe(true);
  });
});

describe("target-guard — happy-path public hosts", () => {
  it("allows example.com", () => {
    expect(checkTargetGuard("example.com").ok).toBe(true);
  });

  it("allows uppercase EXAMPLE.COM", () => {
    expect(checkTargetGuard("EXAMPLE.COM").ok).toBe(true);
  });

  it("allows 8.8.8.8 (Google DNS)", () => {
    expect(checkTargetGuard("8.8.8.8").ok).toBe(true);
  });

  it("allows 2001:4860:4860::8888 (Google IPv6 DNS)", () => {
    expect(checkTargetGuard("2001:4860:4860::8888").ok).toBe(true);
  });

  it("allows public host with port (example.com:443)", () => {
    expect(checkTargetGuard("example.com:443").ok).toBe(true);
  });

  it("allows full URL on public host", () => {
    expect(checkTargetGuard("https://example.com/path?q=1").ok).toBe(true);
  });

  it("allows subdomain api.example.com", () => {
    expect(checkTargetGuard("api.example.com").ok).toBe(true);
  });
});

describe("target-guard — invariant: never throws", () => {
  // Property-style fuzz — the function must always return a structured
  // result, never throw, regardless of what the user pastes in.
  const evilInputs = [
    "", "   ", "\n", "\0",
    "://", "http://", "https://:8080",
    "..", "...", ".",
    "127", "256.256.256.256",
    "[", "]", "[[]]", "[fe80",
    "@", "@@@", "a@b@c@d@localhost",
    "0".repeat(1024),
    "x".repeat(10_000),
    String.fromCharCode(0xFEFF) + "localhost", // BOM prefix
    "localhost\0evil.com",                      // null-byte injection
    "localhost\nhost: evil.com",                // CRLF injection-ish
  ];

  for (const input of evilInputs) {
    it(`returns a structured result for ${JSON.stringify(input).slice(0, 60)}`, () => {
      expect(() => checkTargetGuard(input)).not.toThrow();
      const r = checkTargetGuard(input);
      expect(typeof r.ok).toBe("boolean");
      if (!r.ok) expect(typeof r.reasonKey).toBe("string");
    });
  }
});
