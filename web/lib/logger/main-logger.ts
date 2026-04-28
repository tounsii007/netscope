import path from "path";
import type { AppLogger, LogEntry, LogMeta } from "@/lib/logger/types";
import { buildConsoleLogger, buildNoopLogger } from "@/lib/logger/fallback";

/**
 * Build the application-wide logger backed by Winston with daily-rotate
 * file transports.
 *
 * Files written into LOG_PATH (default: <cwd>/logs/):
 *   • server.YYYY-MM-DD.log — INFO+ for general events
 *   • error.YYYY-MM-DD.log  — ERROR only, preserved 90 days for forensics
 *
 * Falls back to console-logging on edge runtimes (no winston available)
 * and to a no-op stub in the browser bundle, so this module is safe to
 * import from any Server Component or Route Handler without guards at
 * the call site.
 */
export function createLogger(): AppLogger {
  if (typeof window !== "undefined") return buildNoopLogger();

  try {
    // Dynamic require so winston never lands in the browser bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const winston = require("winston");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("winston-daily-rotate-file");

    const logPath = process.env.LOG_PATH ?? path.join(process.cwd(), "logs");

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

    // Minimal shape for the Daily-Rotate constructor — keeps strict TS
    // happy without depending on @types/winston-daily-rotate-file.
    type EventEmitterLike = {
      on(event: string, listener: (...args: unknown[]) => void): unknown;
    };
    type DailyRotateCtor = new (opts: unknown) => EventEmitterLike;
    const transports = winston.transports as Record<string, DailyRotateCtor>;

    const serverTransport = new transports.DailyRotateFile({
      filename:      path.join(logPath, "server.%DATE%.log"),
      datePattern:   "YYYY-MM-DD",
      zippedArchive: true,
      maxSize:       "100m",
      maxFiles:      "30d",
      level:         "info",
      format:        fileFormat,
      auditFile:     path.join(logPath, ".server-audit.json"),
    });

    const errorTransport = new transports.DailyRotateFile({
      filename:      path.join(logPath, "error.%DATE%.log"),
      datePattern:   "YYYY-MM-DD",
      zippedArchive: true,
      maxSize:       "50m",
      maxFiles:      "90d",
      level:         "error",
      format:        fileFormat,
      auditFile:     path.join(logPath, ".error-audit.json"),
    });

    const consoleTransport = new winston.transports.Console({
      level:  process.env.NODE_ENV === "production" ? "warn" : "debug",
      format: consoleFormat,
    });

    const instance = winston.createLogger({
      level:       "debug",
      exitOnError: false,
      transports:  [serverTransport, errorTransport, consoleTransport],
    });

    serverTransport.on("rotate", (...args: unknown[]) => {
      const [oldFile, newFile] = args as [string, string];
      instance.info("Log rotated", { old: oldFile, new: newFile });
    });

    return {
      error: (msg: string, meta?: LogMeta) => instance.error(msg, { meta }),
      warn:  (msg: string, meta?: LogMeta) => instance.warn (msg, { meta }),
      info:  (msg: string, meta?: LogMeta) => instance.info (msg, { meta }),
      http:  (msg: string, meta?: LogMeta) => instance.http (msg, { meta }),
      debug: (msg: string, meta?: LogMeta) => instance.debug(msg, { meta }),
    };
  } catch {
    return buildConsoleLogger();
  }
}
