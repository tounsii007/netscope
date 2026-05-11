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

  // IPv4 numeric checks
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

function parseIpv4(s: string): [number, number, number, number] | null {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1, 5).map((x) => Number(x));
  for (const n of o) if (n < 0 || n > 255) return null;
  return [o[0], o[1], o[2], o[3]];
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

function classifyIpv6(s: string): GuardResult | null {
  // Quick literal checks for the most common cases. We deliberately don't
  // try to be a full IPv6 parser — just catch the obvious blockers.
  if (s === "::" || s === "::1") return { ok: false, reasonKey: "blocked_localhost" };
  // Link-local fe80::/10 — first hextet starts with "fe8"/"fe9"/"fea"/"feb".
  if (/^fe[89ab][0-9a-f]{0,2}:/i.test(s)) return { ok: false, reasonKey: "blocked_link_local" };
  // ULA fc00::/7 — first hextet starts with "fc" or "fd" (any second byte).
  if (/^f[cd][0-9a-f]{0,2}:/i.test(s)) return { ok: false, reasonKey: "blocked_private" };
  // IPv4-mapped IPv6 ("::ffff:127.0.0.1") — recurse into the v4 path.
  const mapped = s.match(/^::(?:ffff:)?((?:\d{1,3}\.){3}\d{1,3})$/i);
  if (mapped) {
    const v4 = parseIpv4(mapped[1]);
    if (v4) return classifyIpv4(v4);
  }
  return null;
}
