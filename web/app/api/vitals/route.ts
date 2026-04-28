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

export async function POST(req: Request) {
  let body: { entries?: VitalEntry[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const entries = Array.isArray(body?.entries) ? body!.entries : [];
  if (entries.length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  // Hard cap so a malicious client can't flood us with one giant POST.
  const cap = entries.slice(0, 50);
  let recorded = 0;
  for (const e of cap) {
    if (!e || typeof e.name !== "string" || !VALID.has(e.name)) continue;
    if (typeof e.value !== "number" || !Number.isFinite(e.value)) continue;

    logger.info("vitals", {
      metric: e.name,
      value: e.value,
      rating: e.rating ?? "unrated",
      page: e.page ?? "",
      nav: e.nav ?? "",
      conn: e.conn ?? "",
      id: e.id ?? "",
    });
    recorded++;
  }

  return NextResponse.json({ ok: true, recorded });
}

// Allow CORS preflights to fail fast (we only accept POSTs).
export function GET() {
  return NextResponse.json({ ok: false, error: "use_POST" }, { status: 405 });
}
