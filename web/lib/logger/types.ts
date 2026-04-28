/**
 * Public types for the logger module. Kept separate so client-side
 * imports of just the type don't pull in winston (which would blow up
 * the browser bundle and produce noisy build warnings).
 */

export interface LogMeta {
  [key: string]: unknown;
}

export type LogLevel = "error" | "warn" | "info" | "http" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: LogMeta;
}

export interface AppLogger {
  error: (msg: string, meta?: LogMeta) => void;
  warn:  (msg: string, meta?: LogMeta) => void;
  info:  (msg: string, meta?: LogMeta) => void;
  http:  (msg: string, meta?: LogMeta) => void;
  debug: (msg: string, meta?: LogMeta) => void;
}
