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
 *     a tab spinner forever. The timeout is wired into the actual
 *     fetch AbortSignal so the underlying connection is torn down,
 *     not just the awaiting Promise; combined with any caller-supplied
 *     signal via AbortSignal.any() so either source wins.
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

/**
 * Create an AbortController paired with a setTimeout that fires
 * `abort(TimeoutError)` after `timeoutMs`. Also relays an
 * already-aborted caller signal so a UI cancel tears the fetch down
 * immediately. Returns null when AbortController isn't usable in the
 * current realm (very old runtimes); callers fall back to Promise.race
 * for timing semantics in that case.
 */
function makeTimeoutController(
  timeoutMs: number,
  caller: AbortSignal | null | undefined,
): { ctrl: AbortController; cancel: () => void } | null {
  let ctrl: AbortController;
  try { ctrl = new AbortController(); } catch { return null; }
  const timer = setTimeout(
    () => ctrl.abort(new DOMException("Request timed out", "TimeoutError")),
    timeoutMs,
  );
  if (caller) {
    if (caller.aborted) ctrl.abort(caller.reason);
    else caller.addEventListener("abort", () => ctrl.abort(caller.reason), { once: true });
  }
  return { ctrl, cancel: () => clearTimeout(timer) };
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Two-layer timeout:
  //   1. Promise.race against a sentinel — the source of truth for *when*
  //      we surface the timeout. Works even when fetch's signal realm
  //      doesn't match ours (jsdom + undici under Vitest).
  //   2. AbortController whose signal is passed to fetch — best effort
  //      tear-down of the underlying connection so production sockets
  //      don't leak. Falls back to no-signal fetch if the realm mismatches.
  const t = makeTimeoutController(DEFAULT_TIMEOUT_MS, init?.signal ?? null);
  let raceTimer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    raceTimer = setTimeout(() => resolve(TIMEOUT_SENTINEL), DEFAULT_TIMEOUT_MS);
  });

  let res: Response;
  try {
    const baseOpts: RequestInit = {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    };
    const fetchPromise = fetch(
      `${BASE}${path}`,
      t ? { ...baseOpts, signal: t.ctrl.signal } : baseOpts,
    ).catch((err) => {
      // Cross-realm signal rejected by fetch's RequestInit validator
      // (jsdom AbortSignal vs undici expected AbortSignal). Retry
      // without signal — Promise.race above still bounds the wait.
      const msg = String((err as Error)?.message ?? err);
      if (t && /AbortSignal|RequestInit/.test(msg) && !t.ctrl.signal.aborted) {
        return fetch(`${BASE}${path}`, baseOpts);
      }
      throw err;
    });

    const winner = await Promise.race([fetchPromise, timeoutPromise]);
    if (winner === TIMEOUT_SENTINEL) {
      // Tear down the underlying fetch where possible — best effort.
      try { t?.ctrl.abort(new DOMException("Request timed out", "TimeoutError")); } catch { /* ignore */ }
      throw new ApiError("Request timed out", 0);
    }
    res = winner as Response;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const e = err as Error & { name?: string };
    if (e?.name === "TimeoutError" || (e?.name === "AbortError" && !init?.signal?.aborted)) {
      throw new ApiError("Request timed out", 0);
    }
    if (e?.name === "AbortError") throw err; // caller cancelled — propagate verbatim
    throw new ApiError(networkErrorMessage(err), 0, err);
  } finally {
    t?.cancel();
    if (raceTimer) clearTimeout(raceTimer);
  }

  if (!res.ok) {
    // Try every common error-shape field name in turn — Spring's
    // GlobalExceptionHandler returns {message,error,timestamp} but
    // intermediate proxies (Cloudflare, nginx) inject different
    // shapes (.detail, .error, plain text). Falling back to the
    // statusText preserves SOMETHING readable.
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    const msg = (body as { message?: string; error?: string; detail?: string }).message
             ?? (body as { error?: string }).error
             ?? (body as { detail?: string }).detail
             ?? `HTTP ${res.status} ${res.statusText}`.trim();
    throw new ApiError(msg, res.status);
  }
  // Wrap the success-path JSON parse so a 200 with non-JSON body
  // (e.g. CDN maintenance HTML surfaced as 200) surfaces as ApiError
  // — without this, the JSON parse error rejection would bubble up
  // as a generic TypeError that the UI can't show nicely.
  try {
    return await (res.json() as Promise<T>);
  } catch (err) {
    throw new ApiError("Server returned invalid JSON", res.status, err);
  }
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
