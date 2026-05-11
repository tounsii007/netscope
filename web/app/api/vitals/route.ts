import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Web-Vitals collection endpoint. Receives buffered metric batches
 * from the client (lib/web-vitals.ts) and forwards them into our
 * structured logger so they show up in Grafana / Loki / whichever
 * sink the deployment uses.
 *
 * We deliberately don't persist anything here — that's the analytics
 * pipeline's job. The point of this route is to give the client a
 * stable, same-origin POST target so sendBeacon works without CORS
 * preflights.
 *
 * The route is also exempt from the global rate limiter (see
 * middleware.ts) since we want every real user's vitals to land
 * regardless of burst pattern. To keep that decision safe we cap
 * the body size and the entry count tightly here.
 */
export const runtime = "nodejs";   // we want the Winston logger, not edge

interface VitalEntry {
  name: string;
  value: number;
  rating?: string;
  id?: string;
  page?: string;
  nav?: string;
  conn?: string;
}

const VALID = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);
/** A typical vitals batch is well under 1 KB; 8 KB leaves headroom
 *  for a longer page URL and the navigation type while still tightly
 *  bounding the per-call cost. */
const MAX_BYTES = 8 * 1024;
const MAX_ENTRIES = 50;
const MAX_STRING_LEN = 256;

export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: false, error: "read_error" }, { status: 400 });
  }
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }

  let body: { entries?: VitalEntry[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const entries = Array.isArray(body?.entries) ? body!.entries : [];
  if (entries.length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  const cap = entries.slice(0, MAX_ENTRIES);
  let recorded = 0;
  for (const e of cap) {
    if (!e || typeof e.name !== "string" || !VALID.has(e.name)) continue;
    if (typeof e.value !== "number" || !Number.isFinite(e.value)) continue;

    logger.info("vitals", {
      metric: e.name,
      value: e.value,
      rating: cap256(e.rating ?? "unrated"),
      page:   cap256(e.page ?? ""),
      nav:    cap256(e.nav ?? ""),
      conn:   cap256(e.conn ?? ""),
      id:     cap256(e.id ?? ""),
    });
    recorded++;
  }

  return NextResponse.json({ ok: true, recorded });
}

function cap256(s: string): string {
  return typeof s === "string" && s.length > MAX_STRING_LEN ? s.slice(0, MAX_STRING_LEN) : s;
}

// Allow CORS preflights to fail fast (we only accept POSTs).
export function GET() {
  return NextResponse.json({ ok: false, error: "use_POST" }, { status: 405 });
}
