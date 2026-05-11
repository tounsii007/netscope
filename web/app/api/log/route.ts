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
/** Max byte length of the JSON body we'll parse. A 16 KB cap is generous
 *  for an error-boundary report (browsers cap stack traces well under
 *  that) but small enough that an attacker can't DoS the log channel
 *  by streaming a multi-MB body line-by-line into Winston. */
const MAX_BYTES = 16 * 1024;
/** Trim the message itself so a single offending log line can't blow
 *  up the daily-rotate file. 8 KB easily fits even verbose JS stack
 *  traces — anything longer is almost certainly noise / abuse. */
const MAX_MSG_LEN = 8_000;
const MAX_META_VALUE_LEN = 4_000;

export async function POST(req: NextRequest) {
  try {
    const len = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(len) && len > MAX_BYTES) {
      return NextResponse.json({ ok: false, reason: "payload too large" }, { status: 413 });
    }

    const raw = await req.text();
    if (raw.length > MAX_BYTES) {
      return NextResponse.json({ ok: false, reason: "payload too large" }, { status: 413 });
    }

    let body: { level?: string; message?: string; meta?: Record<string, unknown> };
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false, reason: "invalid json" }, { status: 400 });
    }
    const { level = "error", message, meta = {} } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ ok: false, reason: "missing message" }, { status: 400 });
    }
    if (!ALLOWED_LEVELS.has(level)) {
      return NextResponse.json({ ok: false, reason: "level not accepted" }, { status: 400 });
    }

    const enriched = {
      ...truncateMeta(meta && typeof meta === "object" ? meta : {}),
      source: "browser",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      ua: req.headers.get("user-agent")?.slice(0, 200),
    };

    const trimmed = message.slice(0, MAX_MSG_LEN);
    if (level === "warn") logger.warn(trimmed, enriched);
    else logger.error(trimmed, enriched);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/**
 * Cap every string-shaped meta value at MAX_META_VALUE_LEN so a
 * malicious or buggy client can't push a 1 MB stack trace into a
 * single log line. Non-string fields pass through untouched — the
 * 16 KB whole-body cap still bounds them.
 */
function truncateMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "string" && v.length > MAX_META_VALUE_LEN) {
      out[k] = v.slice(0, MAX_META_VALUE_LEN) + "…[truncated]";
    } else {
      out[k] = v;
    }
  }
  return out;
}
