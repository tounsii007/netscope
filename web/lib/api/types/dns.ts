/**
 * Result types for DNS-related endpoints: lookup, propagation, DNSSEC.
 */

export type DnsResult = {
  domain: string;
  records: Record<string, string[]>;
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
