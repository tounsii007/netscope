/**
 * Traceronix — server-side logger barrel.
 *
 * Implementation lives in:
 *   • lib/logger/types.ts          — public types
 *   • lib/logger/fallback.ts       — console + no-op fallbacks
 *   • lib/logger/main-logger.ts    — Winston-backed app logger
 *   • lib/logger/access-logger.ts  — separate access.log transport
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("User signed in", { userId, ip });
 *   logger.error("Stripe webhook failed", { error: e.message });
 *
 * NOTE: only meaningful server-side. Client-side imports resolve to a
 * no-op stub so React components can import this module without
 * crashing or bloating the browser bundle.
 */

import { createLogger } from "@/lib/logger/main-logger";
import { createAccessLogger } from "@/lib/logger/access-logger";

export type { AppLogger, LogEntry, LogLevel, LogMeta } from "@/lib/logger/types";

export const logger = createLogger();
export const accessLogger = createAccessLogger();
