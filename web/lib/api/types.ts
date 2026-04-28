/**
 * Public type surface for the api client. Aggregates every domain
 * group in lib/api/types/* so external callers can keep doing
 *   import { type IpResult } from "@/lib/api"
 * without caring how the types are organised internally.
 *
 * Group split:
 *   • dns        — DNS lookup, propagation, DNSSEC
 *   • network    — port check/scan, reachability probes, SSL/TLS
 *   • ip         — single-source + multi-source geolocation
 *   • domain     — WHOIS, subdomains, CDN, tech-stack
 *   • email      — verify, SPF/DKIM/DMARC, blacklist
 *   • web        — headers, redirects, cookies, OG, robots, mixed-content
 *   • routing    — IPv6 readiness, BGP/ASN
 */

export * from "@/lib/api/types/dns";
export * from "@/lib/api/types/network";
export * from "@/lib/api/types/ip";
export * from "@/lib/api/types/domain";
export * from "@/lib/api/types/email";
export * from "@/lib/api/types/web";
export * from "@/lib/api/types/routing";
