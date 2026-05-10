/**
 * Thin fetch wrapper used by every method on the {@link api} object.
 *
 * Features:
 *   • Routes through `NEXT_PUBLIC_API_URL` so dev/prod can swap origins
 *     via env without touching call sites.
 *   • Always sets `Content-Type: application/json` (callers can still
 *     override).
 *   • `cache: "no-store"` — these are diagnostic queries; we never want
 *     a stale cached SSL chain or DNS answer.
 *   • Surfaces backend error messages through `Error.message` so client
 *     UIs can show them as-is.
 *   • Hard timeout (default 30 s) so a misbehaving upstream can't pin
 *     a tab spinner forever. Caller-supplied AbortSignals are composed
 *     so a UI cancel still wins over the timeout.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  readonly status: number;
  readonly cause?: unknown;
  constructor(message: string, status: number, cause?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.cause = cause;
  }
}

const TIMEOUT_SENTINEL = Symbol("api-request-timeout");

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), DEFAULT_TIMEOUT_MS);
  });

  let res: Response;
  try {
    // Pass init.signal through verbatim so caller-driven cancellation
    // still aborts at the network layer. The timeout itself is handled
    // by Promise.race — this avoids cross-realm AbortSignal mismatches
    // in jsdom + MSW test environments while still bounding latency.
    const fetchPromise = fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    const winner = await Promise.race([fetchPromise, timeoutPromise]);
    if (winner === TIMEOUT_SENTINEL) {
      throw new ApiError("Request timed out", 0);
    }
    res = winner as Response;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const e = err as Error & { name?: string };
    if (e?.name === "AbortError") throw err; // caller cancelled — propagate verbatim
    throw new ApiError(networkErrorMessage(err), 0, err);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(body.message ?? `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

function networkErrorMessage(err: unknown): string {
  const msg = (err as Error)?.message ?? "Network request failed";
  // The browser's "Failed to fetch" / "fetch failed" / "ERR_…" are useless
  // to end users; collapse them to a single human-readable line. The
  // original error is still available via ApiError.cause for diagnostics.
  if (/^(failed to fetch|fetch failed|networkerror)/i.test(msg)) {
    return "Network unreachable — check your connection or try again.";
  }
  return msg;
}
