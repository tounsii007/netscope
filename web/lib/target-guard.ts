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
 *
 * Implementation is split across ./target-guard/* — this file is a barrel
 * re-export so all existing consumers keep working unchanged.
 */

export type { GuardReasonKey, GuardResult } from "./target-guard/types";
export { checkTargetGuard, guardErrorKey } from "./target-guard/check";
