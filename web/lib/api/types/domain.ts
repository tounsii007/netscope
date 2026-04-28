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
