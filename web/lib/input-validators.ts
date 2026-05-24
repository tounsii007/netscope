/**
 * Tiny, dependency-free shape validators for the strings users type
 * into the tool input fields. Intentionally CHEAP and SYNCHRONOUS —
 * they run on every keystroke, so anything more expensive than a
 * regex or string scan is unwelcome.
 *
 * Each validator returns one of three statuses:
 *   • "empty"   — nothing typed yet; show no feedback at all
 *   • "valid"   — looks plausible; show a green check
 *   • "invalid" — definitely malformed; show a red dot + the hint
 *
 * Note: these aren't substitutes for the backend's TargetValidator.
 * They only catch SHAPE errors before we send the request — the
 * server still has the final word on whether the host resolves or
 * is allowed.
 */

export type InputStatus = "empty" | "valid" | "invalid";

export interface ValidationResult {
  status: InputStatus;
  /** Localiseable hint key OR raw string — caller decides. */
  hint?: string;
}

/* ── primitive checks ─────────────────────────────────────────────── */

/**
 * RFC-1123 hostname: labels separated by dots, each 1-63 chars,
 * alphanumeric + hyphen, no leading/trailing hyphen per label, total
 * length 1-253. Also accepts IPv4 literals; IPv6 is rejected here
 * because tools that want it should call `isIp` or `isIpv6` instead.
 */
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

const IPV4_RE =
  /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * IPv6 — pragmatic short check. Doesn't catch every malformed combo
 * (no `::` count check) but rejects obvious garbage. Real IPv6
 * parsing belongs server-side.
 */
const IPV6_RE = /^[0-9a-fA-F:]+$/;

const EMAIL_RE =
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/* ── public validators ────────────────────────────────────────────── */

export function isHostname(s: string): boolean {
  return HOSTNAME_RE.test(s);
}

export function isIpv4(s: string): boolean {
  return IPV4_RE.test(s);
}

export function isIpv6(s: string): boolean {
  if (!IPV6_RE.test(s)) return false;
  // Reject "::" abuse: more than one "::" is invalid.
  return (s.match(/::/g) || []).length <= 1;
}

export function isIp(s: string): boolean {
  return isIpv4(s) || isIpv6(s);
}

export function isHostOrIp(s: string): boolean {
  return isHostname(s) || isIp(s);
}

export function isEmail(s: string): boolean {
  return EMAIL_RE.test(s);
}

/**
 * Loose URL check — must look like http(s)://host[/path]. Used by
 * the http-headers tool. Accepts trailing slash and query string.
 */
export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/* ── status helpers ───────────────────────────────────────────────── */

/**
 * Wrap a primitive validator with the empty/valid/invalid trichotomy.
 * Returns "empty" for blank input so the badge can stay hidden until
 * the user actually types something — first-load shouldn't show a
 * red ✗ on an untouched field.
 */
export function validateInput(
  value: string,
  predicate: (s: string) => boolean,
  invalidHint = "invalid",
): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) return { status: "empty" };
  if (predicate(trimmed)) return { status: "valid" };
  return { status: "invalid", hint: invalidHint };
}
