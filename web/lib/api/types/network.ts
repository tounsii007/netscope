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

/**
 * WebSocket handshake probe result. On success the upgrade completed and
 * we measured ping/pong RTT (servers that don't reply to client pings
 * report -1 here, which the UI renders as "no pong"). On failure the
 * handshake threw — the error class name and the original message are
 * surfaced for diagnosis.
 */
export type WebSocketResult = {
  url: string;
  host: string;
  scheme: string;
  ok: boolean;
  totalDurationMs: number;
  /** Only present when ok = true. */
  handshakeLatencyMs?: number;
  /** -1 when the server didn't pong the probe. */
  pingRttMs?: number;
  /** Empty string when no Sec-WebSocket-Protocol was negotiated. */
  subprotocol?: string;
  closeStatusCode?: number | null;
  closeReason?: string | null;
  /** Only present when ok = false. */
  error?: string;
  detail?: string;
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
  /** RSA / EC / etc. Drives the "key strength" badge in the UI. */
  publicKeyAlgorithm?: string;
  /** Modulus bit-length for RSA, field size for EC. */
  publicKeyBits?: number;
  /** Curve name for EC keys (e.g. "secp256r1"). */
  publicKeyCurve?: string;
  /** True when subject == issuer at the leaf — usually a red flag. */
  selfSigned?: boolean;
  /** Backend-detected issues (expiry soon, weak key, SHA-1 sig, …). */
  warnings?: string[];
  sans: string[];
  chain: Array<{
    subject: string; issuer: string; validFrom: string; validTo: string;
    serial: string; sigAlg: string;
    publicKeyAlgorithm?: string; publicKeyBits?: number;
    publicKeyCurve?: string; selfSigned?: boolean;
  }>;
};
