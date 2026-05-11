/**
 * Result types for DNS-related endpoints: lookup, propagation, DNSSEC.
 */

/**
 * Per-record metadata returned alongside the legacy `records` map.
 * Always carries `value`, `ttl`, `dnsClass`. Type-specific fields
 * (`preference`, `exchange` for MX; `primaryNs`, `serial`, etc. for
 * SOA; `flags`, `tag`, `caaValue` for CAA) appear only on the
 * matching record types — render them conditionally on the client.
 */
export type DnsRecordDetail = {
  value: string;
  ttl: number;
  dnsClass: string;
  // MX
  preference?: number;
  exchange?: string;
  // SOA
  primaryNs?: string;
  adminEmail?: string;
  serial?: number;
  refresh?: number;
  retry?: number;
  expire?: number;
  minimum?: number;
  // CAA
  flags?: number;
  tag?: string;
  caaValue?: string;
};

export type DnsResult = {
  domain: string;
  records: Record<string, string[]>;
  recordsDetailed?: Record<string, DnsRecordDetail[]>;
  durationMs: number;
};

export type DnssecResult = {
  domain: string;
  signed: boolean;
  hasRrsig: boolean;
  dsRecords: Array<Record<string, unknown>>;
  dnskeyRecords: Array<Record<string, unknown>>;
  warnings: string[];
};

export type PropagationResult = {
  domain: string;
  type: string;
  resolverCount: number;
  uniqueAnswers: number;
  fullyPropagated: boolean;
  durationMs: number;
  results: Array<{
    resolver: string; region: string; ip: string; ok: boolean;
    values?: string[]; latencyMs: number; error?: string;
  }>;
};
