/**
 * @netscope/sdk — typed client for the NetScope REST API.
 *
 * ```ts
 * import { NetScope } from "@netscope/sdk";
 * const ns = new NetScope({ apiKey: process.env.NETSCOPE_API_KEY });
 * const r = await ns.port.check({ target: "google.com", port: 443 });
 * ```
 */

export class NetScopeError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super(message);
    this.name = "NetScopeError";
  }
}

export interface NetScopeOptions {
  /** API base URL, default https://api.netscope.io */
  baseUrl?: string;
  /** X-API-Key header value */
  apiKey?: string;
  /** Custom fetch (for node < 18 with undici, or tests) */
  fetch?: typeof fetch;
  /** Request timeout in ms (default 30000) */
  timeoutMs?: number;
  /** Retry on 429/5xx (default: 2 retries with exponential backoff) */
  retries?: number;
}

export class NetScope {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(opts: NetScopeOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://api.netscope.io").replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.fetcher = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retries = opts.retries ?? 2;
  }

  /** @internal */
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (this.apiKey) headers.set("X-API-Key", this.apiKey);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    // Only retry idempotent methods. POST/PUT/PATCH/DELETE may have
    // succeeded server-side before the LB returned 502, and retrying
    // them creates duplicate writes — most damaging on /billing/checkout
    // (potential double-charge) and /monitor (orphan rows with auto-
    // incremented names). Callers can override the safety net by
    // setting an `Idempotency-Key` header — when present we retry
    // regardless of method because the server can deduplicate.
    const method = (init.method ?? "GET").toUpperCase();
    const isIdempotent = method === "GET" || method === "HEAD" || method === "OPTIONS";
    const hasIdempotencyKey = headers.has("Idempotency-Key");
    const retryAllowed = isIdempotent || hasIdempotencyKey;
    const maxAttempts = retryAllowed ? this.retries : 0;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetcher(url, { ...init, headers, signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) return (await res.json()) as T;

        const body = await safeJson(res);
        const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < maxAttempts;
        if (!shouldRetry) {
          throw new NetScopeError(res.status, (body as { message?: string })?.message ?? res.statusText, body);
        }
        await delay(backoff(attempt, res.headers.get("Retry-After")));
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        if (e instanceof NetScopeError) throw e;
        if (attempt === maxAttempts) throw e;
        await delay(backoff(attempt));
      }
    }
    throw lastErr ?? new NetScopeError(0, "exhausted retries");
  }

  readonly port = {
    check: (r: { target: string; port: number; protocol?: "tcp" | "udp"; timeoutMs?: number }) =>
      this.request<PortCheck>("/api/v1/port/check", { method: "POST", body: JSON.stringify(r) }),
    scan: (r: { target: string; ports?: number[]; fromPort?: number; toPort?: number; commonOnly?: boolean }) =>
      this.request<PortScan>("/api/v1/port/scan", { method: "POST", body: JSON.stringify(r) }),
  };

  readonly dns = {
    lookup: (domain: string, type = "A,AAAA,MX,TXT,NS") =>
      this.request<DnsResult>(`/api/v1/dns/${enc(domain)}?type=${type}`),
    propagation: (domain: string, type = "A") =>
      this.request<PropagationResult>(`/api/v1/dns-propagation/${enc(domain)}?type=${type}`),
    dnssec: (domain: string) => this.request<DnssecResult>(`/api/v1/dnssec/${enc(domain)}`),
  };

  readonly ssl = {
    inspect: (host: string, port = 443) =>
      this.request<SslResult>(`/api/v1/ssl/${enc(host)}?port=${port}`),
    grade: (host: string, port = 443) =>
      this.request<SslGrade>(`/api/v1/ssl-grade/${enc(host)}?port=${port}`),
  };

  readonly ip = {
    lookup: (ip: string) => this.request<IpResult>(`/api/v1/ip/${enc(ip)}`),
    me: () => this.request<IpResult>("/api/v1/ip/me"),
    blacklist: (ip: string) => this.request<BlacklistResult>(`/api/v1/blacklist/${enc(ip)}`),
  };

  readonly http = {
    headers: (url: string) => this.request<HeadersResult>(`/api/v1/headers?url=${encodeURIComponent(url)}`),
    redirects: (url: string) => this.request<RedirectResult>(`/api/v1/redirect?url=${encodeURIComponent(url)}`),
    reach: (target: string, port?: number) =>
      this.request<ReachResult>("/api/v1/reach/check", {
        method: "POST", body: JSON.stringify({ target, port, method: "auto" }),
      }),
  };

  /**
   * Encrypted DNS, Certificate Transparency, DKIM key fetch, and
   * WebSocket probe. Grouped together because they all answer "is the
   * thing I published reachable / well-formed" — not "did it return
   * data I should ingest into a pipeline".
   */
  readonly dkim = {
    fetch: (domain: string, selector?: string) =>
      this.request<DkimResult>(
        `/api/v1/dkim/${enc(domain)}${selector ? `?selector=${enc(selector)}` : ""}`,
      ),
  };

  readonly ctLogs = {
    search: (domain: string, opts: { includeSubdomains?: boolean; excludeExpired?: boolean } = {}) => {
      const inc = opts.includeSubdomains ?? true;
      const exp = opts.excludeExpired ?? false;
      return this.request<CtLogsResult>(
        `/api/v1/ct-logs/${enc(domain)}?includeSubdomains=${inc}&excludeExpired=${exp}`,
      );
    },
  };

  readonly doh = {
    probe: (domain: string, type = "A") =>
      this.request<DohResult>(`/api/v1/doh/${enc(domain)}?type=${enc(type)}`),
  };

  readonly websocket = {
    probe: (url: string, subprotocol?: string) =>
      this.request<WebSocketResult>(
        `/api/v1/websocket?url=${enc(url)}${subprotocol ? `&subprotocol=${enc(subprotocol)}` : ""}`,
      ),
  };

  readonly monitors = {
    create: (r: MonitorCreate) => this.request<Monitor>("/api/v1/monitor", { method: "POST", body: JSON.stringify(r) }),
    list: () => this.request<Monitor[]>("/api/v1/monitor"),
    history: (id: string, hours = 24) => this.request<Page<MonitorCheck>>(`/api/v1/monitor/${enc(id)}/history?hours=${hours}`),
    delete: (id: string) => this.request<void>(`/api/v1/monitor/${enc(id)}`, { method: "DELETE" }),
  };
}

// ---- types ----
export interface PortCheck {
  target: string; resolvedIp: string; port: number; protocol: string;
  open: boolean; latencyMs: number | null; service: string | null; error: string | null;
}
export interface PortScan {
  target: string; resolvedIp: string; totalChecked: number; openCount: number;
  totalMs: number; results: PortCheck[];
}
export interface DnsResult { domain: string; records: Record<string, string[]>; durationMs: number }
export interface PropagationResult {
  domain: string; type: string; resolverCount: number; uniqueAnswers: number;
  fullyPropagated: boolean; durationMs: number;
  results: Array<{ resolver: string; region: string; ip: string; ok: boolean; values?: string[]; latencyMs: number; error?: string }>;
}
export interface DnssecResult { domain: string; signed: boolean; hasRrsig: boolean; warnings: string[] }
export interface SslResult {
  host: string; port: number; tlsVersion: string; cipherSuite: string;
  issuer: string; validFrom: string; validTo: string;
  daysUntilExpiry: number; expired: boolean; sans: string[];
}
export interface SslGrade {
  host: string; port: number; grade: string; score: number; protocol: string; cipher: string;
  keyAlgorithm: string; keyBits: number; signatureAlgorithm: string;
  daysUntilExpiry: number; forwardSecrecy: boolean; aead: boolean; findings: string[];
}
export interface IpResult {
  ip: string; country?: string; city?: string; region?: string;
  org?: string; asn?: string; isp?: string; timezone?: string;
  lat?: number; lon?: number;
  threat?: { tor: boolean; hosting: boolean; vpn: boolean; proxy: boolean; residential: boolean; riskScore: number };
}
export interface BlacklistResult {
  ip: string; totalChecked: number; listedCount: number; clean: boolean; reputationScore: number;
  results: Array<{ list: string; listed: boolean; responseCodes?: string[]; error?: string }>;
}
export interface HeadersResult {
  url: string; status: number; grade: string; score: number;
  checks: Array<{ header: string; present: boolean; good: boolean; value: string; weight: number; detail: string }>;
}
export interface RedirectResult {
  input: string; finalUrl: string | null; hopCount: number; finalStatusCode: number;
  httpsDowngrade: boolean; warnings: string[];
  hops: Array<{ hop: number; url: string; status: number; latencyMs?: number; location?: string }>;
}
export interface ReachResult {
  target: string; resolvedIp: string;
  http?: { ok: boolean; status?: number; latencyMs?: number; error?: string };
  tcp?: { ok: boolean; port: number; latencyMs?: number; error?: string };
  ping?: { ok: boolean; latencyMs?: number; error?: string };
}
export interface MonitorCreate {
  name: string; type: "http" | "tcp" | "ping"; target: string;
  port?: number; intervalSec?: number; alertEmail?: string;
}
export interface Monitor {
  id: string; name: string; type: string; target: string;
  port?: number; intervalSec: number; enabled: boolean;
}
export interface MonitorCheck {
  id: number; up: boolean; latencyMs?: number; statusCode?: number;
  error?: string; checkedAt: string;
}
export interface Page<T> { content: T[]; totalElements: number; totalPages: number; number: number; size: number }

export interface DkimResult {
  domain: string;
  selector: string | null;
  triedSelectors: string[];
  result: {
    queriedHost?: string;
    present: boolean;
    rawRecord?: string;
    tags?: Record<string, string>;
    keyType?: string;
    keyAlgorithm?: string;
    keySize?: number;
    publicKeyBase64?: string;
    hashAlgorithms?: string[];
    serviceType?: string;
    flags?: string;
    revoked?: boolean;
    warnings?: string[];
  };
}

export interface CtLogsResult {
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
}

export interface DohResult {
  domain: string;
  type: string;
  totalDurationMs: number;
  consistent: boolean;
  distinctAnswerSets: number;
  resolvers: Array<{
    name: string;
    dohEndpoint: string;
    dotHost: string;
    doh: { ok: boolean; latencyMs: number; answerCount?: number; error?: string };
    dot: { reachable: boolean; port: number; latencyMs: number; error?: string };
    answers: string[];
  }>;
}

export interface WebSocketResult {
  url: string;
  host: string;
  scheme: string;
  ok: boolean;
  totalDurationMs: number;
  handshakeLatencyMs?: number;
  pingRttMs?: number;
  subprotocol?: string;
  closeStatusCode?: number | null;
  closeReason?: string | null;
  error?: string;
  detail?: string;
}

// ---- helpers ----
function enc(v: string) { return encodeURIComponent(v); }
function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function backoff(attempt: number, retryAfter?: string | null) {
  if (retryAfter) {
    const n = parseFloat(retryAfter);
    if (!Number.isNaN(n)) return n * 1000;
  }
  return 250 * 2 ** attempt + Math.random() * 100;
}
async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { return { message: res.statusText }; }
}
