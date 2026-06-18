import type { GuardResult } from "./types";
import { LOOPBACK_NAMES, METADATA_IPS, RESERVED_TLDS } from "./constants";
import { classifyIpv4, parseIpv4 } from "./ipv4";
import { classifyIpv6 } from "./ipv6";

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
