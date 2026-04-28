/**
 * Decoded shape of a JWT — both the parsed JSON objects and the raw
 * base64url segments (the latter is occasionally useful for displaying
 * "this is exactly what was signed").
 */
export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  raw: { header: string; payload: string; signature: string };
}

/**
 * base64url → utf-8 string. Normalises the URL-safe alphabet back to
 * standard base64, pads the length to a multiple of 4, then runs the
 * result through atob() and percent-decoding so multi-byte UTF-8
 * survives intact (atob alone returns latin-1).
 */
function b64urlDecode(input: string): string {
  const pad =
    input.length % 4 === 2 ? "==" : input.length % 4 === 3 ? "=" : "";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return decodeURIComponent(
    atob(normalized)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

/**
 * Parse a JWT string into header + payload objects. Returns null if the
 * token isn't well-formed (wrong segment count or non-JSON body) so the
 * UI can render a single error state instead of throwing.
 *
 * Does NOT verify the signature — that requires the issuer's public key,
 * which we never have client-side.
 */
export function decode(token: string): DecodedJwt | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(b64urlDecode(parts[0])),
      payload: JSON.parse(b64urlDecode(parts[1])),
      signature: parts[2],
      raw: { header: parts[0], payload: parts[1], signature: parts[2] },
    };
  } catch {
    return null;
  }
}

/**
 * Sample token for the input placeholder so users see the shape of a
 * JWT without needing one of their own. Has a far-future `exp` so the
 * "Status: Valid" demonstration stays meaningful.
 */
export const SAMPLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9." +
  "signature-placeholder";
