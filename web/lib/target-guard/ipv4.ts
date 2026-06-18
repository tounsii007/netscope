import type { GuardResult } from "./types";

/**
 * Parse an IPv4 address in any encoding `inet_aton(3)` accepts:
 *
 *   • Dotted-quad with decimal octets:   127.0.0.1
 *   • Per-octet hex (0x prefix):          0x7f.0.0.1, 0x7f.0x0.0x0.0x1
 *   • Per-octet octal (leading 0):        0177.0.0.1
 *   • Short forms (1–3 dots):             127.1, 127.0.1
 *   • Pure 32-bit integer:                2130706433
 *   • Pure 32-bit hex:                    0x7f000001
 *
 * Naive dotted-only validation here used to be an SSRF bypass: `2130706433`
 * decodes back to 127.0.0.1 in any libc/JDK resolver, so the FE could
 * accept it while the backend still happily resolved it.
 *
 * Returns the normalised four octets, or null if the input doesn't look
 * like any of the above.
 */
export function parseIpv4(s: string): [number, number, number, number] | null {
  if (!s || /\s/.test(s)) return null;
  const parts = s.split(".");
  if (parts.length === 0 || parts.length > 4) return null;

  const nums: number[] = [];
  for (const p of parts) {
    if (p === "") return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) {
      n = parseInt(p.slice(2), 16);
    } else if (/^0[0-7]+$/.test(p)) {
      n = parseInt(p, 8);
    } else if (/^[0-9]+$/.test(p)) {
      n = parseInt(p, 10);
    } else {
      return null;
    }
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }

  // Combine according to inet_aton semantics:
  //   a            → a is a 32-bit value
  //   a.b          → a is octet 0, b is the low 24 bits
  //   a.b.c        → a, b are octets 0 and 1, c is the low 16 bits
  //   a.b.c.d      → standard dotted-quad, every part must be ≤ 255
  // Multiply instead of shifting — `224 << 24` overflows JS's 32-bit
  // signed-int bitwise space and yields a negative number.
  let raw: number;
  switch (nums.length) {
    case 1:
      raw = nums[0];
      break;
    case 2:
      if (nums[0] > 0xff || nums[1] > 0xffffff) return null;
      raw = nums[0] * 0x1000000 + nums[1];
      break;
    case 3:
      if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null;
      raw = nums[0] * 0x1000000 + nums[1] * 0x10000 + nums[2];
      break;
    case 4:
      if (nums.some((n) => n > 0xff)) return null;
      raw =
        nums[0] * 0x1000000 +
        nums[1] * 0x10000 +
        nums[2] * 0x100 +
        nums[3];
      break;
    default:
      return null;
  }
  if (!Number.isFinite(raw) || raw < 0 || raw > 0xffffffff) return null;
  return [
    Math.floor(raw / 0x1000000) & 0xff,
    Math.floor(raw / 0x10000) & 0xff,
    Math.floor(raw / 0x100) & 0xff,
    raw & 0xff,
  ];
}

export function classifyIpv4([a, b, , ]: [number, number, number, number]): GuardResult {
  if (a === 127) return { ok: false, reasonKey: "blocked_localhost" };
  if (a === 10) return { ok: false, reasonKey: "blocked_private" };
  if (a === 172 && b >= 16 && b <= 31) return { ok: false, reasonKey: "blocked_private" };
  if (a === 192 && b === 168) return { ok: false, reasonKey: "blocked_private" };
  if (a === 169 && b === 254) return { ok: false, reasonKey: "blocked_link_local" };
  if (a === 0) return { ok: false, reasonKey: "blocked_private" };
  // 100.64.0.0/10 — Carrier-grade NAT (RFC 6598) — also internal.
  if (a === 100 && b >= 64 && b <= 127) return { ok: false, reasonKey: "blocked_private" };
  // 224.0.0.0/4 — multicast — diagnostically pointless on this kind of tool.
  if (a >= 224 && a <= 239) return { ok: false, reasonKey: "blocked_private" };
  // 240.0.0.0/4 — reserved
  if (a >= 240) return { ok: false, reasonKey: "blocked_private" };
  return { ok: true };
}
