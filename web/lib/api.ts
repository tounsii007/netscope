const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  portCheck: (target: string, port: number) =>
    request<PortCheckResult>(`/api/v1/port/check`, {
      method: "POST", body: JSON.stringify({ target, port, protocol: "tcp" }),
    }),
  portScan: (target: string, opts: { ports?: number[]; fromPort?: number; toPort?: number; commonOnly?: boolean }) =>
    request<PortScanResult>(`/api/v1/port/scan`, {
      method: "POST", body: JSON.stringify({ target, ...opts }),
    }),
  dns: (domain: string, type = "A,AAAA,MX,TXT,NS") =>
    request<DnsResult>(`/api/v1/dns/${encodeURIComponent(domain)}?type=${type}`),
  ssl: (host: string, port = 443) =>
    request<SslResult>(`/api/v1/ssl/${encodeURIComponent(host)}?port=${port}`),
  ip: (ip: string) => request<IpResult>(`/api/v1/ip/${encodeURIComponent(ip)}`),
  me: () => request<IpResult>(`/api/v1/ip/me`),
  whois: (domain: string) => request<WhoisResult>(`/api/v1/whois/${encodeURIComponent(domain)}`),
  reach: (target: string, port?: number) =>
    request<ReachResult>(`/api/v1/reach/check`, {
      method: "POST", body: JSON.stringify({ target, port, method: "auto" }),
    }),
  propagation: (domain: string, type = "A") =>
    request<PropagationResult>(`/api/v1/dns-propagation/${encodeURIComponent(domain)}?type=${type}`),
  headers: (url: string) =>
    request<HeadersResult>(`/api/v1/headers?url=${encodeURIComponent(url)}`),
  subdomains: (domain: string) =>
    request<SubdomainsResult>(`/api/v1/subdomains/${encodeURIComponent(domain)}`),
  cdn: (host: string) => request<CdnResult>(`/api/v1/cdn/${encodeURIComponent(host)}`),
  emailVerify: (email: string, smtpProbe = false) =>
    request<EmailVerifyResult>(`/api/v1/email/verify`, {
      method: "POST", body: JSON.stringify({ email, smtpProbe }),
    }),
  emailAuth: (domain: string, dkimSelector?: string) =>
    request<EmailAuthResult>(`/api/v1/email-auth/${encodeURIComponent(domain)}${
      dkimSelector ? `?dkimSelector=${encodeURIComponent(dkimSelector)}` : ""}`),
  blacklist: (ip: string) => request<BlacklistResult>(`/api/v1/blacklist/${encodeURIComponent(ip)}`),
  redirects: (url: string) =>
    request<RedirectResult>(`/api/v1/redirect?url=${encodeURIComponent(url)}`),
  tech: (host: string) => request<TechResult>(`/api/v1/tech/${encodeURIComponent(host)}`),
  dnssec: (domain: string) => request<DnssecResult>(`/api/v1/dnssec/${encodeURIComponent(domain)}`),
  cookies: (url: string) => request<CookieResult>(`/api/v1/cookies?url=${encodeURIComponent(url)}`),
  openGraph: (url: string) => request<OgResult>(`/api/v1/opengraph?url=${encodeURIComponent(url)}`),
  robots: (host: string) => request<RobotsResult>(`/api/v1/robots/${encodeURIComponent(host)}`),
  ipv6: (domain: string) => request<Ipv6Result>(`/api/v1/ipv6/${encodeURIComponent(domain)}`),
  bgpIp: (ip: string) => request<BgpIpResult>(`/api/v1/bgp/ip/${encodeURIComponent(ip)}`),
  bgpAsn: (asn: string) => request<BgpAsnResult>(`/api/v1/bgp/asn/${encodeURIComponent(asn)}`),
  mixedContent: (url: string) => request<MixedResult>(`/api/v1/mixed-content?url=${encodeURIComponent(url)}`),
};

export type DnssecResult = {
  domain: string; signed: boolean; hasRrsig: boolean;
  dsRecords: Array<Record<string, unknown>>;
  dnskeyRecords: Array<Record<string, unknown>>;
  warnings: string[];
};
export type CookieResult = {
  url: string; cookieCount: number; insecureCookies: number;
  cookiesWithoutSameSite: number; trackerCount: number; gdprRiskScore: number;
  cookies: Array<{ name?: string; secure?: boolean; httpOnly?: boolean; sameSite?: string }>;
  trackers: Array<{ name: string; category: string; pattern: string }>;
  thirdPartyHosts: string[];
};
export type OgResult = {
  url: string; title?: string; description?: string; image?: string; favicon?: string;
  siteName?: string; type?: string; twitterCard?: string;
  allMeta: Record<string, string>; warnings: string[];
};
export type RobotsResult = {
  host: string;
  robots: { url: string; status?: number; raw?: string; rules?: Record<string, string[]>; sitemaps?: string[]; warnings?: string[]; error?: string };
  sitemaps: Array<{ url: string; status?: number; urlCount?: number; sample?: string[]; isIndex?: boolean; error?: string }>;
};
export type Ipv6Result = {
  domain: string; score: number;
  apex: { a: boolean; aaaa: boolean }; www: { a: boolean; aaaa: boolean };
  nameservers: { total: number; withIpv6: number; hosts: string[] };
  mxRecords: { total: number; withIpv6: number; hosts: string[] };
  warnings: string[];
};
export type BgpIpResult = {
  ip: string; prefix?: string; announced?: boolean; block?: string;
  asns: Array<{ asn: string; holder: string }>;
  relatedPrefixes: string[];
  geo?: { country?: string; city?: string };
};
export type BgpAsnResult = {
  asn: string; holder?: string; announcedPrefixes: number; neighbourCount: number;
  prefixSample: string[];
};
export type MixedResult = {
  url: string; clean: boolean; totalInsecureResources: number;
  blockingResources: number; passiveResources: number;
  byType: Record<string, string[]>; warnings: string[];
};

export type EmailVerifyResult = {
  email: string; local: string; domain: string; syntaxValid: boolean;
  disposable: boolean; role: boolean; mx: string[]; hasMx: boolean;
  score: number; deliverable: boolean;
  smtp?: { mx: string; code?: number; accepted: boolean; error?: string };
};
export type EmailAuthResult = {
  domain: string;
  spf: { present: boolean; record?: string; strict?: boolean; warnings: string[] };
  dmarc: { present: boolean; record?: string; policy?: string; subdomainPolicy?: string;
           percent?: string; reportingTo?: string; warnings: string[] };
  dkim: { present: boolean; selector?: string; record?: string; warnings?: string[] };
  score: number;
};
export type BlacklistResult = {
  ip: string; totalChecked: number; listedCount: number; clean: boolean;
  reputationScore: number; durationMs: number;
  results: Array<{ list: string; listed: boolean; responseCodes?: string[]; error?: string }>;
};
export type RedirectResult = {
  input: string; finalUrl: string | null; hopCount: number;
  finalStatusCode: number; finalStatus: string; httpsDowngrade: boolean;
  hops: Array<{ hop: number; url: string; scheme: string; host: string;
                status: number; latencyMs?: number; location?: string; error?: string }>;
  warnings: string[];
};
export type TechResult = {
  host: string; status: number; totalDetected: number;
  technologies: Record<string, string[]>;
};

export type PropagationResult = {
  domain: string; type: string; resolverCount: number; uniqueAnswers: number;
  fullyPropagated: boolean; durationMs: number;
  results: Array<{ resolver: string; region: string; ip: string; ok: boolean;
    values?: string[]; latencyMs: number; error?: string }>;
};
export type HeadersResult = {
  url: string; status: number; grade: string; score: number;
  server?: string; poweredBy?: string;
  checks: Array<{ header: string; present: boolean; good: boolean; value: string; weight: number; detail: string }>;
  rawHeaders: Record<string, string>;
};
export type SubdomainsResult = { domain: string; count: number; subdomains: string[]; source: string; durationMs: number };
export type CdnResult = {
  host: string; resolvedIp: string; cdns: string[]; usesCdn: boolean;
  server?: string; status: number;
  matches: Array<{ cdn: string; signal: string }>;
};

export type PortCheckResult = {
  target: string; resolvedIp: string; port: number; protocol: string;
  open: boolean; latencyMs: number | null; service: string | null; error: string | null;
};
export type PortScanResult = {
  target: string; resolvedIp: string; totalChecked: number; openCount: number;
  totalMs: number; results: PortCheckResult[];
};
export type DnsResult = { domain: string; records: Record<string, string[]>; durationMs: number };
export type SslResult = {
  host: string; port: number; tlsVersion: string; cipherSuite: string;
  subject: string; issuer: string; validFrom: string; validTo: string;
  daysUntilExpiry: number; expired: boolean; sans: string[];
  chain: Array<{ subject: string; issuer: string; validFrom: string; validTo: string; serial: string; sigAlg: string }>;
};
export type IpResult = {
  ip: string; hostname?: string; city?: string; region?: string; country?: string;
  org?: string; asn?: string; isp?: string; timezone?: string; lat?: number; lon?: number;
  threat?: { tor: boolean; hosting: boolean; vpn: boolean; proxy: boolean; residential: boolean; riskScore: number };
  client?: { browser?: string; os?: string; device?: string; userAgent?: string; acceptLanguage?: string };
};
export type WhoisResult = {
  domain: string; handle?: string; status: string[]; nameservers: string[];
  events: Record<string, string>; registrar?: string;
};
export type ReachResult = {
  target: string; resolvedIp: string;
  http?: { ok: boolean; status?: number; latencyMs?: number; error?: string };
  tcp?: { ok: boolean; port: number; latencyMs?: number; error?: string };
  ping?: { ok: boolean; latencyMs?: number; error?: string };
};
