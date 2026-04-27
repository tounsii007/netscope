/**
 * NetScope — server-side logger (Next.js App Router)
 *
 * Uses Winston with daily-rotate-file transport so a new dated log file
 * is created at midnight and the previous file is closed.
 *
 * Log files (in LOG_PATH, default: logs/):
 *   server.YYYY-MM-DD.log   — INFO and above (all application events)
 *   error.YYYY-MM-DD.log    — ERROR only (with full stack traces)
 *   access.YYYY-MM-DD.log   — one line per HTTP request (written by middleware)
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("User signed in", { userId, ip });
 *   logger.error("Stripe webhook failed", { error: e.message });
 *
 * NOTE: This module only works server-side (Node.js). It is guarded by
 * typeof window === "undefined" checks so it safe to import from any
 * Server Component or Route Handler.
 */

import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogMeta {
  [key: string]: unknown;
}

type LogLevel = "error" | "warn" | "info" | "http" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: LogMeta;
}

// ─── Logger factory ───────────────────────────────────────────────────────────

function createLogger() {
  // Guard: only initialise on the server
  if (typeof window !== "undefined") {
    return buildNoopLogger();
  }

  try {
    // Dynamic require so the module never loads in the browser bundle
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const winston = require("winston");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("winston-daily-rotate-file");

    const logPath = process.env.LOG_PATH ?? path.join(process.cwd(), "logs");

    // ── Shared format ──────────────────────────────────────────────────────
    const fileFormat = winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
      winston.format.errors({ stack: true }),
      winston.format.printf((info: LogEntry & { stack?: string }) => {
        const meta =
          info.meta && Object.keys(info.meta).length
            ? " " + JSON.stringify(info.meta)
            : "";
        const stack = info.stack ? "\n" + info.stack : "";
        return `${info.timestamp} [${info.level.toUpperCase().padEnd(5)}] ${info.message}${meta}${stack}`;
      })
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: "HH:mm:ss.SSS" }),
      winston.format.printf((info: LogEntry) => {
        const meta =
          info.meta && Object.keys(info.meta).length
            ? " " + JSON.stringify(info.meta)
            : "";
        return `${info.timestamp} ${info.level} ${info.message}${meta}`;
      })
    );

    // ── Transports ────────────────────────────────────────────────────────

    // Minimal shape for the parts of DailyRotateFile we actually call. Keeps
    // strict TypeScript happy without depending on @types/winston-daily-rotate-file.
    type EventEmitterLike = {
      on(event: string, listener: (...args: unknown[]) => void): unknown;
    };
    type DailyRotateCtor = new (opts: unknown) => EventEmitterLike;

    /** server.YYYY-MM-DD.log — INFO and above */
    const serverTransport = new (winston.transports as Record<string, DailyRotateCtor>).DailyRotateFile({
      filename:     path.join(logPath, "server.%DATE%.log"),
      datePattern:  "YYYY-MM-DD",
      zippedArchive: true,
      maxSize:      "100m",   // rotate mid-day if file exceeds 100 MB
      maxFiles:     "30d",    // keep 30 days of server logs
      level:        "info",
      format:       fileFormat,
      auditFile:    path.join(logPath, ".server-audit.json"),
    });

    /** error.YYYY-MM-DD.log — ERROR only */
    const errorTransport = new (winston.transports as Record<string, DailyRotateCtor>).DailyRotateFile({
      filename:     path.join(logPath, "error.%DATE%.log"),
      datePattern:  "YYYY-MM-DD",
      zippedArchive: true,
      maxSize:      "50m",
      maxFiles:     "90d",    // errors kept for 90 days
      level:        "error",
      format:       fileFormat,
      auditFile:    path.join(logPath, ".error-audit.json"),
    });

    /** Console — development only */
    const consoleTransport = new winston.transports.Console({
      level:  process.env.NODE_ENV === "production" ? "warn" : "debug",
      format: consoleFormat,
    });

    const instance = winston.createLogger({
      level:       "debug",
      exitOnError: false,
      transports:  [serverTransport, errorTransport, consoleTransport],
    });

    // Emit warnings when queue flushes to prevent silent drops in high volume
    serverTransport.on("rotate", (...args: unknown[]) => {
      const [oldFile, newFile] = args as [string, string];
      instance.info("Log rotated", { old: oldFile, new: newFile });
    });

    return {
      error: (msg: string, meta?: LogMeta) => instance.error(msg, { meta }),
      warn:  (msg: string, meta?: LogMeta) => instance.warn(msg,  { meta }),
      info:  (msg: string, meta?: LogMeta) => instance.info(msg,  { meta }),
      http:  (msg: string, meta?: LogMeta) => instance.http(msg,  { meta }),
      debug: (msg: string, meta?: LogMeta) => instance.debug(msg, { meta }),
    };
  } catch {
    // Winston not available (e.g. edge runtime) — fall back to console
    return buildConsoleLogger();
  }
}

// ─── Fallbacks ────────────────────────────────────────────────────────────────

function buildConsoleLogger() {
  const fmt = (level: string, msg: string, meta?: LogMeta) =>
    `${new Date().toISOString()} [${level}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`;
  return {
    error: (m: string, meta?: LogMeta) => console.error(fmt("ERROR", m, meta)),
    warn:  (m: string, meta?: LogMeta) => console.warn(fmt("WARN",  m, meta)),
    info:  (m: string, meta?: LogMeta) => console.info(fmt("INFO",  m, meta)),
    http:  (m: string, meta?: LogMeta) => console.log(fmt("HTTP",   m, meta)),
    debug: (m: string, meta?: LogMeta) => console.debug(fmt("DEBUG", m, meta)),
  };
}

function buildNoopLogger() {
  const noop = () => {};
  return { error: noop, warn: noop, info: noop, http: noop, debug: noop };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const logger = createLogger();

// ─── Access logger (separate transport → access.log) ─────────────────────────

function createAccessLogger() {
  if (typeof window !== "undefined") return { write: (_: string) => {} };

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const winston = require("winston");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("winston-daily-rotate-file");

    const logPath = process.env.LOG_PATH ?? path.join(process.cwd(), "logs");

    /** access.YYYY-MM-DD.log — one CLF-like line per request */
    const transport = new (winston.transports as Record<string, new (opts: unknown) => unknown>).DailyRotateFile({
      filename:     path.join(logPath, "access.%DATE%.log"),
      datePattern:  "YYYY-MM-DD",
      zippedArchive: true,
      maxSize:      "200m",
      maxFiles:     "30d",
      format:       winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
        winston.format.printf(
          (info: { timestamp: string; message: string }) =>
            `${info.timestamp} ${info.message}`
        )
      ),
      auditFile: path.join(logPath, ".access-audit.json"),
    });

    const instance = winston.createLogger({
      level:      "http",
      transports: [transport],
    });

    return {
      write: (line: string) => instance.http(line.trim()),
    };
  } catch {
    return { write: (line: string) => console.log("[ACCESS]", line.trim()) };
  }
}

export const accessLogger = createAccessLogger();
