import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCspWithNonce, generateNonce } from "@/lib/csp";

// Tests assert the production CSP shape: script-src uses 'strict-dynamic' +
// nonce (NEVER 'unsafe-inline'); style-src keeps 'unsafe-inline' as a
// pragmatic Option B from F-FE-02 (every inline style="…" attribute
// otherwise breaks in production because nonces only apply to <style> tags,
// not style attributes). Follow-up: enumerate hashes for the small set of
// dynamic style values and migrate to Option A ('unsafe-hashes' + sha256-…).
// Vitest defaults NODE_ENV to "test" — we use vi.stubEnv to switch to
// "production" per test, which is isolated per worker. Direct mutation
// of process.env.NODE_ENV would leak into parallel tests when vitest
// runs with --maxConcurrency > 1.
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => {
  vi.unstubAllEnvs();
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
    // script-src MUST NOT carry 'unsafe-inline' — the 'strict-dynamic' +
    // nonce pair is the whole point of the CSP hardening. Use a directive-
    // local check so style-src's pragmatic 'unsafe-inline' (F-FE-02 Option
    // B) doesn't false-positive this assertion.
    const scriptSrc = csp.match(/script-src [^;]*/)?.[0] ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("includes 'unsafe-inline' on style-src for inline style=\"…\" attributes (F-FE-02)", () => {
    const csp = buildCspWithNonce("XYZ789");
    // Nonces only apply to <style> tags, not style="…" attributes. Without
    // 'unsafe-inline' on style-src, every React component using style={{}}
    // renders broken in production. F-FE-02 documents the trade-off and
    // chose Option B (allow inline styles) over Option A (hash allowlist).
    expect(csp).toMatch(/style-src 'self' 'nonce-XYZ789' 'unsafe-inline' fonts\.googleapis\.com/);
  });

  it("relaxes to 'unsafe-inline' in dev mode (HMR + React devtools need it)", () => {
    vi.stubEnv("NODE_ENV", "development");
    const csp = buildCspWithNonce("dev-nonce");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("'unsafe-eval'");
    // Dev still includes the nonce — production-shaped tests pass either way.
    expect(csp).toContain("'nonce-dev-nonce'");
  });

  it("keeps the existing security directives unchanged", () => {
    const csp = buildCspWithNonce("NONCE1");
    // Sanity: every directive from the static next.config.ts CSP must
    // still be present (less the script-src 'unsafe-inline' allowance —
    // style-src keeps 'unsafe-inline' per F-FE-02 Option B).
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
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.staging.example.com");
    const csp = buildCspWithNonce("X");
    expect(csp).toContain("https://api.staging.example.com");
    // No manual cleanup — vi.unstubAllEnvs() in afterEach restores both
    // this stub AND the NODE_ENV stub from beforeEach without leaking
    // between tests.
  });
});
