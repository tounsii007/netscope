/**
 * Client-side defense-in-depth check for "is the user pointing this tool at
 * something that should never be a target of a public diagnostic?"
 *
 * The authoritative gate lives in the backend `TargetValidator`, but rejecting
 * obviously-internal targets early gives the user a clearer error (translated,
 * shown next to the input) and saves a network round-trip to the API just to
 * be told "forbidden".
 *
 * Block categories:
 *   • Loopback names: localhost, *.localhost, ip6-localhost, ip6-loopback
 *   • IPv4 loopback / private / link-local / cloud-metadata
 *   • IPv6 loopback (::1), link-local (fe80::/10), ULA (fc00::/7),
 *     IPv4-mapped + IPv4-compat into the v4 ranges above
 *   • mDNS .local, RFC 6761 reserved names (.test, .invalid, .example)
 *
 * The check operates on the *raw user input* before normaliseHost runs, so
 * forms can call it the moment the user submits.
 */

export type GuardResult =
  | { ok: true }
  | { ok: false; reasonKey: GuardReasonKey };

export type GuardReasonKey =
  | "blocked_localhost"
  | "blocked_private"
  | "blocked_link_local"
  | "blocked_metadata"
  | "blocked_reserved_tld"
  | "invalid_target";

const LOOPBACK_NAMES = new Set([
  "localhost",
  "localhost.localdomain", // Linux /etc/hosts default alias for 127.0.0.1
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

/**
 * RFC 6761 reserved TLDs that resolve to nothing on the open Internet — used
 * by example/test fixtures and home networks. Diagnosing them on a
 * public-facing tool is meaningless and confuses users when results come
 * back empty.
 */
const RESERVED_TLDS = new Set([
  "local",        // mDNS / Bonjour
  "localhost",    // RFC 6761
  "test",         // RFC 6761
  "invalid",      // RFC 6761
  "example",      // RFC 6761 — example.com/.org/.net are NOT this; only .example as a TLD
  "internal",     // de-facto enterprise convention
  "lan",          // home-router convention
  "home",         // home-router convention
  "corp",         // proposed reserved (ICANN bow-out)
]);

/** Cloud-provider metadata IPs — never reachable on the public Internet. */
const METADATA_IPS = new Set([
  "169.254.169.254", // AWS / Azure / GCP / DO / Oracle / IBM
  "100.100.100.200", // Alibaba Cloud
  "192.0.0.192",     // Oracle (legacy)
]);

export function checkTargetGuard(raw: string): GuardResult {
  if (!raw) return { ok: false, reasonKey: "invalid_target" };
  // Strip a leading scheme if present so "http://localhost" guards the same
  // way as bare "localhost".
  let s = raw.trim().toLowerCase();
  if (!s) return { ok: false, reasonKey: "invalid_target" };
  // Reject "://" or "scheme://" with no host.
  if (/^[a-z][a-z0-9+.-]*:\/\/\s*$/i.test(s)) return { ok: false, reasonKey: "invalid_target" };
  if (/^:\/\/\s*$/.test(s)) return { ok: false, reasonKey: "invalid_target" };
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  if (!s) return { ok: false, reasonKey: "invalid_target" };
  // Drop userinfo, path, query, fragment, port — same shape as normaliseHost.
  s = s.split(/[/?#]/)[0];
  const atIdx = s.indexOf("@");
  if (atIdx >= 0) s = s.slice(atIdx + 1);
  // Drop bracketed IPv6 port suffix: [::1]:8080 → ::1
  if (s.startsWith("[")) {
    const close = s.indexOf("]");
    if (close > 0) s = s.slice(1, close);
  } else {
    const colonIdx = s.indexOf(":");
    // For IPv4 / hostnames a single colon means port; IPv6 has multiple colons.
    if (colonIdx > 0 && (s.match(/:/g) || []).length === 1) s = s.slice(0, colonIdx);
  }
  if (s.endsWith(".")) s = s.slice(0, -1);
  if (!s) return { ok: false, reasonKey: "invalid_target" };

  if (LOOPBACK_NAMES.has(s)) return { ok: false, reasonKey: "blocked_localhost" };
  // Any *.localhost.* sub-domain — RFC 6761 reserves the entire tree.
  if (s === "localhost" || s.endsWith(".localhost")) {
    return { ok: false, reasonKey: "blocked_localhost" };
  }

  // Reserved-TLD check operates on the rightmost label.
  const lastDot = s.lastIndexOf(".");
  if (lastDot > 0) {
    const tld = s.slice(lastDot + 1);
    if (RESERVED_TLDS.has(tld)) return { ok: false, reasonKey: "blocked_reserved_tld" };
  }

  // Cloud metadata
  if (METADATA_IPS.has(s)) return { ok: false, reasonKey: "blocked_metadata" };

  // IPv4 numeric checks — covers dotted-quad plus all the legacy encodings
  // (decimal/hex single-int, short-form like "127.1", mixed-base octets)
  // that `inet_aton(3)` and `InetAddress.getByName()` decode back to a real
  // IPv4 address. Naive dotted-only validation is a classic SSRF bypass.
  const v4 = parseIpv4(s);
  if (v4) return classifyIpv4(v4);

  // IPv6 numeric checks (must come before the "no dot, treat as label" path
  // so addresses like ::1 / fe80::1 don't fall through).
  if (s.includes(":")) {
    const v6 = classifyIpv6(s);
    if (v6) return v6;
  }

  return { ok: true };
}

/**
 * Lookup-friendly translation key for a guard rejection. Each Tool client
 * passes this to its own `useTranslations("guard")` namespace which the
 * locale bundles fill in.
 */
export function guardErrorKey(r: GuardResult): string | null {
  return r.ok ? null : r.reasonKey;
}

/* ── helpers ─────────────────────────────────────────────────────────── */

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
function parseIpv4(s: string): [number, number, number, number] | null {
  if (!s || /\s/.test(s)) return null;
  const parts = s.split(".");
  if (parts.length === 0 || parts.length > 4) return null;

  const nums: number[] = [];
  for (const p of parts) {
    if (p === "") return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) {
      // Hex
      n = parseInt(p.slice(2), 16);
    } else if (/^0[0-7]+$/.test(p)) {
      // Octal (leading zero, all digits ≤ 7)
      n = parseInt(p, 8);
    } else if (/^[0-9]+$/.test(p)) {
      // Decimal — also matches single "0"
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
  // We multiply instead of shifting because `224 << 24` overflows
  // JS's 32-bit signed-int bitwise space and yields a negative number.
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
  // Unsigned-right-shift keeps the top bit out of the sign.
  return [
    Math.floor(raw / 0x1000000) & 0xff,
    Math.floor(raw / 0x10000) & 0xff,
    Math.floor(raw / 0x100) & 0xff,
    raw & 0xff,
  ];
}

function classifyIpv4([a, b, , ]: [number, number, number, number]): GuardResult {
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
function expandIpv6(input: string): string | null {
  // Drop zone identifier, e.g. "fe80::1%eth0" → "fe80::1".
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

function classifyIpv6(s: string): GuardResult | null {
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
  // Indicators: high six hextets all zero, or zero plus "ffff".
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
