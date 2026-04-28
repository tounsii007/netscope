/**
 * Result types for low-level network reachability: port checks, scans,
 * and the multi-layer reach probe.
 */

export type PortCheckResult = {
  target: string; resolvedIp: string; port: number; protocol: string;
  open: boolean; latencyMs: number | null;
  service: string | null; error: string | null;
};

export type PortScanResult = {
  target: string; resolvedIp: string;
  totalChecked: number; openCount: number; totalMs: number;
  results: PortCheckResult[];
};

export type ReachResult = {
  target: string; resolvedIp: string;
  http?: { ok: boolean; status?: number; latencyMs?: number; error?: string };
  tcp?:  { ok: boolean; port: number; latencyMs?: number; error?: string };
  ping?: { ok: boolean; latencyMs?: number; error?: string };
};

/**
 * Result of an SSL/TLS handshake — issuer, validity window, the full
 * chain up to the root, plus the negotiated cipher suite and protocol
 * version.
 */
export type SslResult = {
  host: string; port: number; tlsVersion: string; cipherSuite: string;
  subject: string; issuer: string;
  validFrom: string; validTo: string;
  daysUntilExpiry: number; expired: boolean;
  sans: string[];
  chain: Array<{
    subject: string; issuer: string; validFrom: string; validTo: string;
    serial: string; sigAlg: string;
  }>;
};
