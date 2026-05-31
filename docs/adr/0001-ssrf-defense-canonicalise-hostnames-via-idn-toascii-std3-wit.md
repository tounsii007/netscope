# 0001 — SSRF defense: canonicalise hostnames via IDN.toASCII(STD3) with pre-screening, and resolve ALL A/AAAA records

**Status:** Accepted (2026-05-31)

## Context

`/api/v1/*` accepts user-supplied hostnames as scan targets (DNS, SSL, headers,
WHOIS, etc.). A naive `InetAddress.getByName` + `isSiteLocalAddress` check leaks
four SSRF classes:

1. **Homograph hosts.** Cyrillic `а` (U+0430) passes a Latin-only regex but
   resolves to a different host than the operator intended.
2. **Split-horizon DNS.** A hostname publishing `A 8.8.8.8` first and
   `A 127.0.0.1` second slips past first-record-only validation.
3. **Cloud metadata.** `169.254.169.254`, `fd00:ec2::254`, `100.100.100.200`,
   `192.0.0.192` sit outside RFC 1918 and outside Java's built-in private/link-
   local classifiers, yet hand out IAM credentials.
4. **Silent IDN bypasses.** Newer JDKs (>=21 on IDNA 2008, demonstrably >=25)
   map ZWNBSP (U+FEFF), em-dash (U+2014), and RTL override (U+202E) into valid
   Punycode instead of throwing on STD3. The deprecated `::a.b.c.d` IPv4-
   compatible IPv6 form (RFC 4291 §2.5.5.1) — including `::127.0.0.1` — is
   silently NOT reported as loopback/link-local by Java.

## Decision

A layered canonicalisation pipeline (`HostnameNormaliser`) and a separate
classifier (`BlockedAddressRules`), orchestrated by `TargetValidator`:

1. Lowercase + trim, then short-circuit IP literals (regex `^[0-9a-fA-F:.]+$`).
2. **ASCII fast-path.** Pure-ASCII hostnames skip IDN — `HOST_PATTERN` permits
   `_` (some SaaS DNS configs require it) but STD3 forbids it, so IDN would
   400 a legitimate `foo_bar.example.com`.
3. **Pre-IDN codepoint screen.** `hasNonHostCodepoint` rejects every non-ASCII
   codepoint outside `{Ll, Lu, Lt, Lm, Lo, Nd, Nl, No, Mn, Mc}` — i.e. format
   (`Cf`), control (`Cc`), unassigned (`Cn`), private-use (`Co`), any non-
   ASCII punctuation/separator class — before IDN ever sees them. Latin,
   Cyrillic, CJK, Arabic, and Devanagari letters still canonicalise.
4. `IDN.toASCII(input, IDN.USE_STD3_ASCII_RULES)` — explicitly NOT
   `ALLOW_UNASSIGNED`, which is the surface homograph attacks target.
5. `HOST_PATTERN` validation on canonical form.
6. `InetAddress.getAllByName` — reject if **any** address is blocked.
7. **Byte-level metadata comparison.** Cloud-metadata IPs are stored as raw
   byte arrays in a `Set<ByteBuf>` and matched via `Arrays.equals`, side-
   stepping IPv6 string-form ambiguity (`fd00:ec2::254` vs expanded).
8. Explicit handling for IPv6 ULA (`fc00::/7`, RFC 4193), IPv4-compatible IPv6
   (decode embedded v4 and recurse), CGNAT (`100.64.0.0/10`, RFC 6598), and
   reserved (`240.0.0.0/4`, RFC 1112 §4) — none of which Java's built-ins flag.

## Consequences

**Gave up:** the one-liner `getByName + isSiteLocalAddress` (silently allows
all six attack classes above); `ALLOW_UNASSIGNED` (exactly the homograph
surface as Unicode outpaces IDNA tables); single-address validation (split-
horizon leaks).

**Paid:** ~160 lines of densely-commented code across `HostnameNormaliser` and
`BlockedAddressRules`, plus the maintenance tax of keeping three parallel
implementations in sync — `api/.../security/BlockedAddressRules.java`,
`api/.../ip/IpAddressGuard.java`, and `web/lib/target-guard.ts`. Worth it:
every layer backs a known CVE class.

## References

- `api/src/main/java/io/netscope/common/security/TargetValidator.java:23-44` — orchestrator + `getAllByName` loop
- `api/src/main/java/io/netscope/common/security/HostnameNormaliser.java:32-90` — IDN pipeline + STD3 + ASCII fast-path
- `api/src/main/java/io/netscope/common/security/HostnameNormaliser.java:133-160` — `hasNonHostCodepoint` pre-screen
- `api/src/main/java/io/netscope/common/security/BlockedAddressRules.java:36-55` — cloud-metadata byte set
- `api/src/main/java/io/netscope/common/security/BlockedAddressRules.java:57-88` — ULA / IPv4-compat-IPv6 / CGNAT / reserved
