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
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}
