import type { AppLogger, LogMeta } from "@/lib/logger/types";

/**
 * Console-only logger used when winston isn't available (edge runtime,
 * unusual deployment targets). Same surface as the full Winston-backed
 * logger so call sites don't need to branch.
 */
export function buildConsoleLogger(): AppLogger {
  const fmt = (level: string, msg: string, meta?: LogMeta) =>
    `${new Date().toISOString()} [${level}] ${msg}${
      meta ? " " + JSON.stringify(meta) : ""
    }`;
  return {
    error: (m, meta) => console.error(fmt("ERROR", m, meta)),
    warn:  (m, meta) => console.warn(fmt("WARN",  m, meta)),
    info:  (m, meta) => console.info(fmt("INFO",  m, meta)),
    http:  (m, meta) => console.log(fmt("HTTP",   m, meta)),
    debug: (m, meta) => console.debug(fmt("DEBUG", m, meta)),
  };
}

/**
 * No-op logger used during client-side bundling. Imports of the logger
 * module from React components must not crash; they just silently
 * discard messages because logging belongs on the server.
 */
export function buildNoopLogger(): AppLogger {
  const noop = () => {};
  return { error: noop, warn: noop, info: noop, http: noop, debug: noop };
}
