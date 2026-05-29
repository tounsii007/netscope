/**
 * Domain-level result types: WHOIS/RDAP, subdomain enumeration, CDN
 * detection, tech-stack fingerprinting.
 */

export type WhoisResult = {
  domain: string; handle?: string;
  status: string[]; nameservers: string[];
  events: Record<string, string>;
  registrar?: string;
};

export type SubdomainsResult = {
  domain: string;
  count: number;
  subdomains: string[];
  source?: string;
  durationMs?: number;
  /** True when the response is capped at MAX_SUBDOMAINS — there are more matches we didn't return. */
  truncated?: boolean;
  /** True when the upstream CT log (crt.sh) was unreachable / circuit-open — list will be empty. */
  degraded?: boolean;
  /** Human-readable explanation when degraded=true. */
  message?: string;
};

export type CdnResult = {
  host: string; resolvedIp: string;
  cdns: string[]; usesCdn: boolean;
  server?: string; status: number;
  matches: Array<{ cdn: string; signal: string }>;
};

export type TechResult = {
  host: string; status: number; totalDetected: number;
  technologies: Record<string, string[]>;
};

/**
 * Certificate Transparency log entry as surfaced by crt.sh after
 * normalisation (newline-split SANs become arrays, ISO dates parsed,
 * expiry computed). Issuer aggregation is rolled up at the result level
 * so the UI can render "X distinct CAs issued for this domain" without
 * re-walking the array.
 */
export type CtLogsResult = {
  domain: string;
  includeSubdomains: boolean;
  totalReturned: number;
  truncated: boolean;
  issuerSummary: Record<string, number>;
  certificates: Array<{
    id: number;
    serial: string;
    commonName: string | null;
    nameValue: string | null;
    issuerCaName: string;
    issuerCaId: number;
    notBefore: string;
    notAfter: string;
    validForDays: number;
    expired: boolean;
    daysUntilExpiry: number;
    sans: string[];
  }>;
  durationMs?: number;
};
