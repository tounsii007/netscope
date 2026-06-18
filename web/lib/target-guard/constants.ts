export const LOOPBACK_NAMES = new Set([
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
export const RESERVED_TLDS = new Set([
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
export const METADATA_IPS = new Set([
  "169.254.169.254", // AWS / Azure / GCP / DO / Oracle / IBM
  "100.100.100.200", // Alibaba Cloud
  "192.0.0.192",     // Oracle (legacy)
]);
