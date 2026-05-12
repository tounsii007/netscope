import { request } from "@/lib/api/request";
import type {
  BgpAsnResult, BgpIpResult, BlacklistResult, CdnResult, CookieResult,
  DnssecResult, DnsResult, EmailAuthResult, EmailVerifyResult,
  HeadersResult, IpMultiSourceResult, IpResult, Ipv6Result, MixedResult,
  OgResult, PortCheckResult, PortScanResult, PropagationResult,
  ReachResult, RedirectResult, RobotsResult, SslResult, SubdomainsResult,
  TechResult, WhoisResult,
} from "@/lib/api/types";

/**
 * The {@link api} singleton — one method per backend endpoint. Methods
 * are deliberately thin wrappers around `request()` so call sites can
 * read like prose: `await api.ssl(host)`. Type parameters are explicit
 * so editor hover always shows the exact shape returned.
 */
export const api = {
  // — Ports / reach —
  // Every method accepts a trailing optional { signal } so the caller can
  // hold an AbortController ref and cancel a previous in-flight request
  // when the user re-submits. Without this, fast re-submits can land
  // out-of-order — a slow earlier response overwrites the correct later
  // state. The signal is plumbed through request() into fetch.
  portCheck: (target: string, port: number, opts: { signal?: AbortSignal } = {}) =>
    request<PortCheckResult>(`/api/v1/port/check`, {
      method: "POST",
      body: JSON.stringify({ target, port, protocol: "tcp" }),
      signal: opts.signal,
    }),
  portScan: (
    target: string,
    scan: { ports?: number[]; fromPort?: number; toPort?: number; commonOnly?: boolean },
    opts: { signal?: AbortSignal } = {}
  ) =>
    request<PortScanResult>(`/api/v1/port/scan`, {
      method: "POST",
      body: JSON.stringify({ target, ...scan }),
      signal: opts.signal,
    }),
  reach: (target: string, port?: number) =>
    request<ReachResult>(`/api/v1/reach/check`, {
      method: "POST",
      body: JSON.stringify({ target, port, method: "auto" }),
    }),

  // — DNS —
  dns: (domain: string, type = "A,AAAA,MX,TXT,NS") =>
    request<DnsResult>(`/api/v1/dns/${encodeURIComponent(domain)}?type=${type}`),
  propagation: (domain: string, type = "A") =>
    request<PropagationResult>(
      `/api/v1/dns-propagation/${encodeURIComponent(domain)}?type=${type}`
    ),
  dnssec: (domain: string) =>
    request<DnssecResult>(`/api/v1/dnssec/${encodeURIComponent(domain)}`),

  // — TLS / SSL —
  ssl: (host: string, port = 443) =>
    request<SslResult>(`/api/v1/ssl/${encodeURIComponent(host)}?port=${port}`),

  // — IP —
  ip: (ip: string) => request<IpResult>(`/api/v1/ip/${encodeURIComponent(ip)}`),
  ipSources: (ip: string) =>
    request<IpMultiSourceResult>(`/api/v1/ip/${encodeURIComponent(ip)}/sources`),
  me: () => request<IpResult>(`/api/v1/ip/me`),

  // — Domain / WHOIS / Subdomains / CDN / Tech —
  whois: (domain: string) =>
    request<WhoisResult>(`/api/v1/whois/${encodeURIComponent(domain)}`),
  subdomains: (domain: string) =>
    request<SubdomainsResult>(`/api/v1/subdomains/${encodeURIComponent(domain)}`),
  cdn: (host: string) =>
    request<CdnResult>(`/api/v1/cdn/${encodeURIComponent(host)}`),
  tech: (host: string) =>
    request<TechResult>(`/api/v1/tech/${encodeURIComponent(host)}`),

  // — Email —
  emailVerify: (email: string, smtpProbe = false) =>
    request<EmailVerifyResult>(`/api/v1/email/verify`, {
      method: "POST",
      body: JSON.stringify({ email, smtpProbe }),
    }),
  emailAuth: (domain: string, dkimSelector?: string) =>
    request<EmailAuthResult>(
      `/api/v1/email-auth/${encodeURIComponent(domain)}${
        dkimSelector ? `?dkimSelector=${encodeURIComponent(dkimSelector)}` : ""
      }`
    ),
  blacklist: (ip: string) =>
    request<BlacklistResult>(`/api/v1/blacklist/${encodeURIComponent(ip)}`),

  // — Web —
  headers: (url: string) =>
    request<HeadersResult>(`/api/v1/headers?url=${encodeURIComponent(url)}`),
  redirects: (url: string) =>
    request<RedirectResult>(`/api/v1/redirect?url=${encodeURIComponent(url)}`),
  cookies: (url: string) =>
    request<CookieResult>(`/api/v1/cookies?url=${encodeURIComponent(url)}`),
  openGraph: (url: string) =>
    request<OgResult>(`/api/v1/opengraph?url=${encodeURIComponent(url)}`),
  robots: (host: string) =>
    request<RobotsResult>(`/api/v1/robots/${encodeURIComponent(host)}`),
  mixedContent: (url: string) =>
    request<MixedResult>(`/api/v1/mixed-content?url=${encodeURIComponent(url)}`),

  // — IPv6 / BGP —
  ipv6: (domain: string) =>
    request<Ipv6Result>(`/api/v1/ipv6/${encodeURIComponent(domain)}`),
  bgpIp: (ip: string) =>
    request<BgpIpResult>(`/api/v1/bgp/ip/${encodeURIComponent(ip)}`),
  bgpAsn: (asn: string) =>
    request<BgpAsnResult>(`/api/v1/bgp/asn/${encodeURIComponent(asn)}`),
};
