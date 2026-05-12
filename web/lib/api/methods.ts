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
  reach: (target: string, port?: number, opts: { signal?: AbortSignal } = {}) =>
    request<ReachResult>(`/api/v1/reach/check`, {
      method: "POST",
      body: JSON.stringify({ target, port, method: "auto" }),
      signal: opts.signal,
    }),

  // — DNS —
  dns: (domain: string, type = "A,AAAA,MX,TXT,NS", opts: { signal?: AbortSignal } = {}) =>
    request<DnsResult>(`/api/v1/dns/${encodeURIComponent(domain)}?type=${type}`, { signal: opts.signal }),
  propagation: (domain: string, type = "A", opts: { signal?: AbortSignal } = {}) =>
    request<PropagationResult>(
      `/api/v1/dns-propagation/${encodeURIComponent(domain)}?type=${type}`,
      { signal: opts.signal },
    ),
  dnssec: (domain: string, opts: { signal?: AbortSignal } = {}) =>
    request<DnssecResult>(`/api/v1/dnssec/${encodeURIComponent(domain)}`, { signal: opts.signal }),

  // — TLS / SSL —
  ssl: (host: string, port = 443, opts: { signal?: AbortSignal } = {}) =>
    request<SslResult>(`/api/v1/ssl/${encodeURIComponent(host)}?port=${port}`, { signal: opts.signal }),

  // — IP —
  ip: (ip: string, opts: { signal?: AbortSignal } = {}) =>
    request<IpResult>(`/api/v1/ip/${encodeURIComponent(ip)}`, { signal: opts.signal }),
  ipSources: (ip: string, opts: { signal?: AbortSignal } = {}) =>
    request<IpMultiSourceResult>(`/api/v1/ip/${encodeURIComponent(ip)}/sources`, { signal: opts.signal }),
  me: (opts: { signal?: AbortSignal } = {}) =>
    request<IpResult>(`/api/v1/ip/me`, { signal: opts.signal }),

  // — Domain / WHOIS / Subdomains / CDN / Tech —
  whois: (domain: string, opts: { signal?: AbortSignal } = {}) =>
    request<WhoisResult>(`/api/v1/whois/${encodeURIComponent(domain)}`, { signal: opts.signal }),
  subdomains: (domain: string, opts: { signal?: AbortSignal } = {}) =>
    request<SubdomainsResult>(`/api/v1/subdomains/${encodeURIComponent(domain)}`, { signal: opts.signal }),
  cdn: (host: string, opts: { signal?: AbortSignal } = {}) =>
    request<CdnResult>(`/api/v1/cdn/${encodeURIComponent(host)}`, { signal: opts.signal }),
  tech: (host: string, opts: { signal?: AbortSignal } = {}) =>
    request<TechResult>(`/api/v1/tech/${encodeURIComponent(host)}`, { signal: opts.signal }),

  // — Email —
  emailVerify: (email: string, smtpProbe = false, opts: { signal?: AbortSignal } = {}) =>
    request<EmailVerifyResult>(`/api/v1/email/verify`, {
      method: "POST",
      body: JSON.stringify({ email, smtpProbe }),
      signal: opts.signal,
    }),
  emailAuth: (domain: string, dkimSelector?: string, opts: { signal?: AbortSignal } = {}) =>
    request<EmailAuthResult>(
      `/api/v1/email-auth/${encodeURIComponent(domain)}${
        dkimSelector ? `?dkimSelector=${encodeURIComponent(dkimSelector)}` : ""
      }`,
      { signal: opts.signal },
    ),
  blacklist: (ip: string, opts: { signal?: AbortSignal } = {}) =>
    request<BlacklistResult>(`/api/v1/blacklist/${encodeURIComponent(ip)}`, { signal: opts.signal }),

  // — Web —
  headers: (url: string, opts: { signal?: AbortSignal } = {}) =>
    request<HeadersResult>(`/api/v1/headers?url=${encodeURIComponent(url)}`, { signal: opts.signal }),
  redirects: (url: string, opts: { signal?: AbortSignal } = {}) =>
    request<RedirectResult>(`/api/v1/redirect?url=${encodeURIComponent(url)}`, { signal: opts.signal }),
  cookies: (url: string, opts: { signal?: AbortSignal } = {}) =>
    request<CookieResult>(`/api/v1/cookies?url=${encodeURIComponent(url)}`, { signal: opts.signal }),
  openGraph: (url: string, opts: { signal?: AbortSignal } = {}) =>
    request<OgResult>(`/api/v1/opengraph?url=${encodeURIComponent(url)}`, { signal: opts.signal }),
  robots: (host: string, opts: { signal?: AbortSignal } = {}) =>
    request<RobotsResult>(`/api/v1/robots/${encodeURIComponent(host)}`, { signal: opts.signal }),
  mixedContent: (url: string, opts: { signal?: AbortSignal } = {}) =>
    request<MixedResult>(`/api/v1/mixed-content?url=${encodeURIComponent(url)}`, { signal: opts.signal }),

  // — IPv6 / BGP —
  ipv6: (domain: string) =>
    request<Ipv6Result>(`/api/v1/ipv6/${encodeURIComponent(domain)}`),
  bgpIp: (ip: string) =>
    request<BgpIpResult>(`/api/v1/bgp/ip/${encodeURIComponent(ip)}`),
  bgpAsn: (asn: string) =>
    request<BgpAsnResult>(`/api/v1/bgp/asn/${encodeURIComponent(asn)}`),
};
