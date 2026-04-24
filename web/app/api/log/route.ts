/**
 * POST /api/log
 * Client-side error boundary reporter.
 * Receives JSON { level, message, meta } from the browser and writes it to
 * the server-side error.log so client exceptions appear in the daily log files.
 *
 * Only level "error" and "warn" accepted — info/debug from browser are dropped
 * to avoid flooding the log files.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const ALLOWED_LEVELS = new Set(["error", "warn"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { level?: string; message?: string; meta?: Record<string, unknown> };
    const { level = "error", message, meta = {} } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ ok: false, reason: "missing message" }, { status: 400 });
    }
    if (!ALLOWED_LEVELS.has(level)) {
      return NextResponse.json({ ok: false, reason: "level not accepted" }, { status: 400 });
    }

    const enriched = {
      ...meta,
      source: "browser",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      ua: req.headers.get("user-agent")?.slice(0, 200),
    };

    if (level === "warn") logger.warn(message, enriched);
    else logger.error(message, enriched);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
