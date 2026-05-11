/**
 * IP-lookup result types — single-source view plus the aggregator that
 * compares answers from several geolocation providers in parallel.
 */

export type IpResult = {
  ip: string; hostname?: string;
  city?: string; region?: string; country?: string;
  org?: string; asn?: string; isp?: string;
  timezone?: string; lat?: number; lon?: number;
  /** 4 or 6 — driven by the backend's InetAddress shape, not regex. */
  version?: 4 | 6;
  /** Educational A/B/C/D/E classification for IPv4 results. */
  addressClass?: string;
  /** Reverse-DNS / PTR record. Bounded server-side at 1.5 s. */
  reverseDns?: string;
  threat?: {
    tor: boolean; hosting: boolean; vpn: boolean; proxy: boolean;
    residential: boolean; riskScore: number;
  };
  client?: {
    browser?: string; os?: string; device?: string;
    userAgent?: string; acceptLanguage?: string;
  };
};

/**
 * One provider's view of an IP. The backend queries 4–5 free APIs in
 * parallel; each entry captures that provider's response or its error
 * so the UI can show a side-by-side comparison.
 */
export type IpSourceEntry = {
  source: string;
  url: string;
  ok: boolean;
  latencyMs: number;
  error?: string | null;
  data?: {
    ip?: string; hostname?: string;
    city?: string; region?: string;
    country?: string; country_name?: string; continent?: string; postal?: string;
    timezone?: string; lat?: number; lon?: number;
    asn?: string; org?: string; isp?: string;
    currency?: string; calling_code?: string; languages?: string;
    in_eu?: boolean; is_eu?: boolean;
    type?: string; domain?: string;
    flag_emoji?: string; flag_img?: string;
    [key: string]: unknown;
  } | null;
};

export type IpMultiSourceResult = {
  ip: string;
  durationMs: number;
  sourceCount: number;
  successCount: number;
  cached?: boolean;
  sources: IpSourceEntry[];
};
