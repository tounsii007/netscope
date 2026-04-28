import path from "path";

/**
 * Dedicated access-log transport. Lives in its own file because it has
 * a completely different output shape (one CLF-like line per request,
 * no level prefix) and a longer retention than the application logs.
 *
 * Returns an object with `.write(line)` so middleware can plug into it
 * exactly the way Morgan-style loggers expect.
 */
export interface AccessLogger {
  write: (line: string) => void;
}

export function createAccessLogger(): AccessLogger {
  if (typeof window !== "undefined") return { write: () => {} };

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const winston = require("winston");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("winston-daily-rotate-file");

    const logPath = process.env.LOG_PATH ?? path.join(process.cwd(), "logs");
    type DailyRotateCtor = new (opts: unknown) => unknown;
    const transports = winston.transports as Record<string, DailyRotateCtor>;

    const transport = new transports.DailyRotateFile({
      filename:      path.join(logPath, "access.%DATE%.log"),
      datePattern:   "YYYY-MM-DD",
      zippedArchive: true,
      maxSize:       "200m",
      maxFiles:      "30d",
      format: winston.format.combine(
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

    return { write: (line: string) => instance.http(line.trim()) };
  } catch {
    return { write: (line: string) => console.log("[ACCESS]", line.trim()) };
  }
}
