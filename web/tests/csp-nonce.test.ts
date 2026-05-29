import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCspWithNonce, generateNonce } from "@/lib/csp";

// Tests assert the production CSP shape ('strict-dynamic', no 'unsafe-inline').
// Vitest defaults NODE_ENV to "test" — we explicitly switch to "production"
// per test so the buildCsp's dev/prod branch evaluates the strict side.
let savedEnv: string | undefined;
beforeEach(() => {
  savedEnv = process.env.NODE_ENV;
  // @ts-expect-error NODE_ENV is typed readonly by @types/node; test override is intentional
  process.env.NODE_ENV = "production";
});
afterEach(() => {
  // @ts-expect-error see above
  process.env.NODE_ENV = savedEnv;
});

describe("CSP nonce generator", () => {
  it("returns a 128-bit (≥22 char) base64-ish value", () => {
    const n = generateNonce();
    // 16 random bytes → base64 is 24 chars with padding, 22 without.
    expect(n.length).toBeGreaterThanOrEqual(22);
    // Base64 alphabet only — '+', '/', and A-Z a-z 0-9. No '=' padding.
    expect(n).toMatch(/^[A-Za-z0-9+/]+$/);
  });

  it("returns a distinct value on every call", () => {
    // 128 bits of entropy makes a duplicate astronomically unlikely.
    // Sampling 1000 confirms the generator isn't accidentally
    // deterministic (e.g. seeded once at module load).
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateNonce());
    expect(seen.size).toBe(1000);
  });
});

describe("CSP-with-nonce builder", () => {
  it("substitutes 'unsafe-inline' with 'nonce-<value>' for script-src", () => {
    const csp = buildCspWithNonce("ABCDEF1234");
    expect(csp).toMatch(/script-src 'self' 'nonce-ABCDEF1234' 'strict-dynamic'/);
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it("substitutes 'unsafe-inline' with 'nonce-<value>' for style-src", () => {
    const csp = buildCspWithNonce("XYZ789");
    // Production builds drop 'unsafe-inline' for styles entirely; only
    // the nonce + 'self' + the Google Fonts CSS host remain.
    expect(csp).toMatch(/style-src 'self' 'nonce-XYZ789' fonts\.googleapis\.com/);
    expect(csp).not.toContain("'unsafe-inline'");
  });

  it("relaxes to 'unsafe-inline' in dev mode (HMR + React devtools need it)", () => {
    // @ts-expect-error see file-level note
    process.env.NODE_ENV = "development";
    const csp = buildCspWithNonce("dev-nonce");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("'unsafe-eval'");
    // Dev still includes the nonce — production-shaped tests pass either way.
    expect(csp).toContain("'nonce-dev-nonce'");
  });

  it("keeps the existing security directives unchanged", () => {
    const csp = buildCspWithNonce("NONCE1");
    // Sanity: every directive from the static next.config.ts CSP must
    // still be present (less the two 'unsafe-inline' allowances).
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("report-uri /api/csp-report");
  });

  it("includes 'strict-dynamic' so Next.js's hydration chunks inherit the nonce", () => {
    // strict-dynamic lets the nonce'd bootstrap script load further
    // chunks without each chunk needing its own nonce attribute.
    // Removing it would force every dynamically imported route chunk
    // to be tagged manually — a regression that breaks SSR hydration.
    const csp = buildCspWithNonce("X");
    expect(csp).toContain("'strict-dynamic'");
  });

  it("honours NEXT_PUBLIC_API_URL for connect-src", () => {
    const origURL = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.staging.example.com";
    try {
      const csp = buildCspWithNonce("X");
      expect(csp).toContain("https://api.staging.example.com");
    } finally {
      process.env.NEXT_PUBLIC_API_URL = origURL;
    }
  });
});
