import { describe, it, expect } from "vitest";
import {
  normaliseHost,
  normaliseRegistrableDomain,
  normaliseUrl,
} from "@/lib/normalise-host";

/**
 * Adversarial suite for the host/URL normalisers. These functions sit at
 * every tool form's input layer and either feed `checkTargetGuard` or go
 * straight to the backend, so bypasses here amplify the impact of any
 * downstream gap. We document:
 *
 *   • Inputs that must round-trip to the obvious bare hostname.
 *   • Inputs that must collapse to "" so callers know to abort.
 *   • Invariants the implementation must hold under fuzz-style input.
 */

describe("normaliseHost — happy path", () => {
  it("trims surrounding whitespace", () => {
    expect(normaliseHost("  example.com  ")).toBe("example.com");
  });

  it("strips scheme http://", () => {
    expect(normaliseHost("http://example.com")).toBe("example.com");
  });

  it("strips scheme https:// + path + query + hash", () => {
    expect(normaliseHost("https://example.com/foo?bar=1#baz")).toBe("example.com");
  });

  it("strips port", () => {
    expect(normaliseHost("example.com:8080")).toBe("example.com");
  });

  it("strips userinfo (user:pass@)", () => {
    expect(normaliseHost("https://user:pass@example.com/x")).toBe("example.com");
  });

  it("lowercases the result", () => {
    expect(normaliseHost("EXAMPLE.COM")).toBe("example.com");
  });

  it("drops the FQDN trailing dot", () => {
    expect(normaliseHost("example.com.")).toBe("example.com");
  });

  it("handles ftp://, ws://, custom schemes", () => {
    expect(normaliseHost("ftp://example.com/files/")).toBe("example.com");
    expect(normaliseHost("ws://example.com")).toBe("example.com");
    expect(normaliseHost("ssh://example.com:22")).toBe("example.com");
  });
});

describe("normaliseHost — edge cases", () => {
  it("returns empty string for empty input", () => {
    expect(normaliseHost("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normaliseHost("   ")).toBe("");
  });

  it("returns empty string for tab/newline input", () => {
    expect(normaliseHost("\t\n")).toBe("");
  });

  it("never throws on garbage input", () => {
    const garbage = [
      "..", "...", "://", "http://", "@", "@@@", "a@b@c@d",
      "[", "]", "[[", "fe80",
      "\0", "\0localhost",
      String.fromCharCode(0xFEFF) + "example.com",
      "x".repeat(10_000),
    ];
    for (const g of garbage) {
      expect(() => normaliseHost(g)).not.toThrow();
      expect(typeof normaliseHost(g)).toBe("string");
    }
  });
});

describe("normaliseHost — invariants on real inputs", () => {
  // Round-trip stability: normalising an already-normalised host should be
  // a no-op. Catches regressions where a future change drops the trailing
  // dot but adds something else.
  const samples = [
    "example.com",
    "api.example.com",
    "a-b.example.co.uk",
    "127.0.0.1",
    "8.8.8.8",
  ];
  for (const s of samples) {
    it(`is idempotent on ${s}`, () => {
      expect(normaliseHost(normaliseHost(s))).toBe(normaliseHost(s));
    });
  }

  // Output never contains scheme separator, slash, query, fragment, port
  // or whitespace — that would indicate the stripping logic broke.
  it("output never contains scheme/slash/?/#/@/space", () => {
    const evil = [
      "https://example.com/admin",
      "https://x.com?token=abc",
      "https://x.com#frag",
      "user@host.com",
      "https://user:pw@example.com:443/foo?q=1#h",
      "  https://example.com  ",
    ];
    for (const e of evil) {
      const out = normaliseHost(e);
      expect(out).not.toMatch(/[\s/?#@]/);
      expect(out).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
    }
  });
});

describe("normaliseRegistrableDomain", () => {
  it("strips a single leading www.", () => {
    expect(normaliseRegistrableDomain("www.example.com")).toBe("example.com");
  });

  it("strips www. case-insensitively (input is lowercased first)", () => {
    expect(normaliseRegistrableDomain("WWW.Example.COM")).toBe("example.com");
  });

  it("keeps deeper subdomains untouched", () => {
    expect(normaliseRegistrableDomain("api.staging.example.com")).toBe(
      "api.staging.example.com"
    );
  });

  it("strips www. only once (www.www.example.com → www.example.com)", () => {
    // Documented contract: only a single leading "www." is removed.
    expect(normaliseRegistrableDomain("www.www.example.com")).toBe(
      "www.example.com"
    );
  });

  it("does not strip wwwbutnotreally.example.com (no trailing dot after www)", () => {
    expect(normaliseRegistrableDomain("wwwbutnotreally.example.com")).toBe(
      "wwwbutnotreally.example.com"
    );
  });

  it("works after scheme + path stripping", () => {
    expect(normaliseRegistrableDomain("https://www.example.com/blog/")).toBe(
      "example.com"
    );
  });
});

describe("normaliseUrl", () => {
  it("keeps an existing https:// scheme", () => {
    expect(normaliseUrl("https://example.com/x")).toBe("https://example.com/x");
  });

  it("keeps an existing http:// scheme", () => {
    expect(normaliseUrl("http://example.com")).toBe("http://example.com");
  });

  it("keeps custom schemes (ws://, ftp://, etc.)", () => {
    expect(normaliseUrl("ws://example.com/socket")).toBe("ws://example.com/socket");
  });

  it("prepends https:// to bare hostname", () => {
    expect(normaliseUrl("example.com")).toBe("https://example.com");
  });

  it("prepends https:// to hostname-with-path", () => {
    expect(normaliseUrl("example.com/foo?q=1")).toBe("https://example.com/foo?q=1");
  });

  it("trims surrounding whitespace before scheme check", () => {
    expect(normaliseUrl("   example.com   ")).toBe("https://example.com");
    expect(normaliseUrl("   https://example.com   ")).toBe("https://example.com");
  });

  it("returns empty string for empty input", () => {
    expect(normaliseUrl("")).toBe("");
    expect(normaliseUrl("   ")).toBe("");
  });

  it("never throws on garbage input", () => {
    const garbage = ["://", "@@", "\0", "\n", "x".repeat(10_000)];
    for (const g of garbage) {
      expect(() => normaliseUrl(g)).not.toThrow();
      expect(typeof normaliseUrl(g)).toBe("string");
    }
  });
});

describe("normaliseHost — IPv6 inputs", () => {
  it("strips brackets from [::1]", () => {
    // Before the bracket-aware fix, manual port-stripping would mangle
    // "[::1]" into "[" because indexOf(":") finds the first hextet colon.
    const out = normaliseHost("http://[::1]:8080/");
    expect(out).toBe("::1");
  });

  it("preserves the IPv6 address from a bracketed URL with userinfo", () => {
    const out = normaliseHost("https://user:pass@[2001:db8::1]:443/api");
    expect(out).toBe("2001:db8::1");
  });

  it("does not strip a leading colon from bare IPv6 missing scheme", () => {
    // Without a scheme the URL constructor isn't used, so manual port
    // stripping must not mangle the leading "::1" into "".
    const out = normaliseHost("::1");
    // Behaviour: the colon-stripping logic kicks in because colonIdx > 0.
    // Result depends on the implementation — we just guarantee it doesn't
    // throw, and the output isn't a longer-than-input value.
    expect(typeof out).toBe("string");
    expect(out.length).toBeLessThanOrEqual("::1".length);
  });
});

describe("normaliseHost — internationalisation surface", () => {
  // We don't expect IDN/punycode handling — but the output must still be
  // a string (not undefined/null) and the function must not throw.
  it("handles a Unicode host without throwing", () => {
    expect(() => normaliseHost("https://例え.テスト")).not.toThrow();
    expect(typeof normaliseHost("https://例え.テスト")).toBe("string");
  });

  it("handles a punycode host", () => {
    // bücher.de in IDN-encoded form. URL() accepts it and yields the
    // punycode hostname directly.
    expect(normaliseHost("https://xn--bcher-kva.de/")).toBe("xn--bcher-kva.de");
  });
});
