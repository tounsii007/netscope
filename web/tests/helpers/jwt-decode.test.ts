import { describe, it, expect } from "vitest";
import { decode, SAMPLE_JWT } from "@/app/[locale]/jwt/jwt-decode";

describe("jwt decode", () => {
  it("decodes a standard HS256 token", () => {
    const d = decode(SAMPLE_JWT);
    expect(d).not.toBeNull();
    expect(d!.header.alg).toBe("HS256");
    expect(d!.header.typ).toBe("JWT");
    expect(d!.payload.sub).toBe("1234567890");
  });

  it("returns null for tokens with the wrong number of segments", () => {
    expect(decode("")).toBeNull();
    expect(decode("only.two")).toBeNull();
    expect(decode("a.b.c.d")).toBeNull();
  });

  it("returns null when a segment isn't valid base64url JSON", () => {
    expect(decode("notb64.notb64.notb64")).toBeNull();
    // Header is valid base64 but the decoded bytes aren't JSON.
    const h = btoa(JSON.stringify({ alg: "HS256" })).replace(/=+$/, "");
    expect(decode(`${h}.aGVsbG8.sig`)).toBeNull();
  });

  it("preserves the raw segments alongside the parsed objects", () => {
    const d = decode(SAMPLE_JWT)!;
    const parts = SAMPLE_JWT.split(".");
    expect(d.raw.header).toBe(parts[0]);
    expect(d.raw.payload).toBe(parts[1]);
    expect(d.raw.signature).toBe(parts[2]);
  });

  it("trims surrounding whitespace before parsing", () => {
    const padded = `   ${SAMPLE_JWT}   \n`;
    expect(decode(padded)).not.toBeNull();
  });

  it("handles UTF-8 in the payload (multi-byte chars)", () => {
    const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = b64url(JSON.stringify({ name: "François 名前 🎉" }));
    const tok = `${header}.${payload}.sig`;
    const d = decode(tok)!;
    expect(d.payload.name).toBe("François 名前 🎉");
  });

  it("never throws on adversarial input", () => {
    const inputs = [
      ".",
      "..",
      "...",
      "....",
      "🔥.🔥.🔥",
      "a".repeat(1_000_000) + ".b.c", // 1 MB header
    ];
    for (const t of inputs) {
      expect(() => decode(t)).not.toThrow();
    }
  });
});

// Helper — base64url encode without depending on the library under test
function b64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
