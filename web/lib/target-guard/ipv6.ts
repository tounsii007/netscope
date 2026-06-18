import type { GuardResult } from "./types";
import { classifyIpv4, parseIpv4 } from "./ipv4";

/**
 * Expand an IPv6 address to its canonical eight-hextet form (lowercase,
 * each hextet zero-padded to 4 chars). Handles "::" compression, IPv4
 * tail (e.g. "::ffff:127.0.0.1"), and the zone identifier suffix
 * ("%eth0"). Returns null if the input isn't a syntactically plausible
 * IPv6 address.
 *
 * The previous guard only matched a handful of literal forms (`::1`,
 * `::`) and missed the full-form spellings every attacker tries first:
 * `0:0:0:0:0:0:0:1`, `0000:…:0001`, `0::1`. Expanding to canonical first
 * lets us match the whole class with one substring comparison.
 */
export function expandIpv6(input: string): string | null {
  const pct = input.indexOf("%");
  let s = pct >= 0 ? input.slice(0, pct) : input;
  if (!s.includes(":")) return null;

  // IPv4 tail (mapped/compat): "::ffff:127.0.0.1" → splice in two extra
  // hextets from the decoded 32-bit address.
  const tailMatch = s.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (tailMatch) {
    const v4 = parseIpv4(tailMatch[2]);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = tailMatch[1] + hi + ":" + lo;
  }

  // Split on "::" at most once. "::" expands to fill the address.
  const dblColonCount = (s.match(/::/g) || []).length;
  if (dblColonCount > 1) return null;

  let head: string[], tail: string[];
  if (dblColonCount === 1) {
    const [h, t] = s.split("::");
    head = h ? h.split(":") : [];
    tail = t ? t.split(":") : [];
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    head = head.concat(Array(fill).fill("0"), tail);
  } else {
    head = s.split(":");
  }

  if (head.length !== 8) return null;

  const padded: string[] = [];
  for (const hextet of head) {
    if (!/^[0-9a-f]{1,4}$/i.test(hextet)) return null;
    padded.push(hextet.toLowerCase().padStart(4, "0"));
  }
  return padded.join(":");
}

export function classifyIpv6(s: string): GuardResult | null {
  const expanded = expandIpv6(s);
  if (!expanded) return null;
  const hextets = expanded.split(":");

  // Loopback "::1" — every hextet zero except the last which is "0001".
  if (
    hextets.slice(0, 7).every((h) => h === "0000") &&
    (hextets[7] === "0001" || hextets[7] === "0000")
  ) {
    return { ok: false, reasonKey: "blocked_localhost" };
  }

  // Link-local fe80::/10 — first 10 bits 1111 1110 10. In a 4-char hextet
  // that's "fe80".."febf".
  const first = parseInt(hextets[0], 16);
  if (first >= 0xfe80 && first <= 0xfebf) {
    return { ok: false, reasonKey: "blocked_link_local" };
  }

  // ULA fc00::/7 — leading hextet fc00..fdff.
  if (first >= 0xfc00 && first <= 0xfdff) {
    return { ok: false, reasonKey: "blocked_private" };
  }

  // IPv4-mapped/-compatible into the v4 ranges already classified.
  const allZeroPrefix = hextets.slice(0, 6).every((h) => h === "0000");
  const mappedPrefix =
    hextets.slice(0, 5).every((h) => h === "0000") && hextets[5] === "ffff";
  if (allZeroPrefix || mappedPrefix) {
    const high = parseInt(hextets[6], 16);
    const low = parseInt(hextets[7], 16);
    const v4: [number, number, number, number] = [
      (high >>> 8) & 0xff,
      high & 0xff,
      (low >>> 8) & 0xff,
      low & 0xff,
    ];
    const verdict = classifyIpv4(v4);
    if (!verdict.ok) return verdict;
  }

  return null;
}
