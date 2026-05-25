/**
 * POST /api/csp-report
 *
 * Receives CSP violation reports from browsers and surfaces them
 * through the structured Winston logger. Modern Chromium/Safari send
 * `application/reports+json` arrays via the Reporting API; Firefox
 * and older Chromium still send `application/csp-report` legacy
 * objects via the `report-uri` directive. We accept both and
 * normalise to one shape before logging.
 *
 * The route is intentionally exempt from the edge rate limiter (see
 * middleware.ts) — losing CSP reports during an active attack would
 * be the moment we most want them — so the per-call caps below are
 * the only DoS guard. They're sized to fit a few buffered reports
 * comfortably while still bounding the worst case.
 *
 * Cache-Control: no-store on the response so a misbehaving CDN never
 * caches a 204 and starves us of future reports.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** Max body size — a single violation report is ~1 KB and the
 *  browser batches up to ~10 before delivery. 16 KB leaves headroom
 *  while keeping the per-call cost bounded. */
const MAX_BYTES = 16 * 1024;
/** Cap on number of reports we log per request, even if the body
 *  parses as a longer array. Same logic as /api/log + /api/vitals. */
const MAX_REPORTS = 20;
/** Cap on each string field we forward to the logger so a single
 *  weird violation can't blow up a daily-rotate file. */
const MAX_FIELD_LEN = 2_000;

interface LegacyReport {
  "csp-report"?: Record<string, unknown>;
}
interface ModernReport {
  type?: string;
  age?: number;
  url?: string;
  user_agent?: string;
  body?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const noStore = { "Cache-Control": "no-store" } as const;

  const len = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > MAX_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413, headers: noStore });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  }
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413, headers: noStore });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  }

  // Normalise: modern API delivers an array; legacy delivers an object.
  const list: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const reports = list.slice(0, MAX_REPORTS);

  for (const r of reports) {
    if (!r || typeof r !== "object") continue;

    const modern = r as ModernReport;
    const legacy = r as LegacyReport;
    const body =
      modern.body && typeof modern.body === "object"
        ? modern.body
        : legacy["csp-report"];

    if (!body || typeof body !== "object") continue;

    logger.warn("csp-violation", {
      source: "browser",
      type: cap(modern.type ?? "csp-violation"),
      url: cap((body as Record<string, unknown>)["document-uri"] as string | undefined),
      directive: cap(
        ((body as Record<string, unknown>)["effective-directive"] as string | undefined) ??
        ((body as Record<string, unknown>)["violated-directive"] as string | undefined),
      ),
      blocked: cap((body as Record<string, unknown>)["blocked-uri"] as string | undefined),
      sample: cap((body as Record<string, unknown>)["script-sample"] as string | undefined),
      lineNumber: (body as Record<string, unknown>)["line-number"],
      columnNumber: (body as Record<string, unknown>)["column-number"],
      disposition: cap((body as Record<string, unknown>).disposition as string | undefined),
      statusCode: (body as Record<string, unknown>)["status-code"],
      ua: req.headers.get("user-agent")?.slice(0, 200) ?? "-",
    });
  }

  // 204 No Content is the canonical response for the Reporting API;
  // a JSON body would just be dropped by the browser anyway.
  return new NextResponse(null, { status: 204, headers: noStore });
}

function cap(s: string | undefined): string {
  if (typeof s !== "string") return "";
  return s.length > MAX_FIELD_LEN ? s.slice(0, MAX_FIELD_LEN) + "…[truncated]" : s;
}

/**
 * Browsers preflight some Reporting-API endpoints with OPTIONS even
 * for same-origin POSTs. Return a 204 with the right CORS-ish
 * affordances so the report itself isn't dropped. (Note: CSP
 * violation reports are same-origin by spec, so OPTIONS shouldn't
 * normally fire — but defending in depth never hurts.)
 */
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      Allow: "POST, OPTIONS",
    },
  });
}

/** Reject everything else so misbehaving scanners get a clean 405. */
export function GET() {
  return NextResponse.json(
    { ok: false, error: "use_POST" },
    { status: 405, headers: { "Cache-Control": "no-store", Allow: "POST, OPTIONS" } },
  );
}
