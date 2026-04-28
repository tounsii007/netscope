/**
 * Public API surface for client + server callers.
 *
 * The actual implementation is split across:
 *   • lib/api/request.ts — fetch wrapper
 *   • lib/api/types.ts   — every result type
 *   • lib/api/methods.ts — the {api} object
 *
 * This file re-exports them as a single barrel so consumers can keep
 * writing `import { api, type IpResult } from "@/lib/api"` exactly as
 * before — no churn at call sites.
 */

export { api } from "@/lib/api/methods";
export * from "@/lib/api/types";
