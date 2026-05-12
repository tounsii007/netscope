import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { type NextRequest, NextResponse } from "next/server";
import { rateLimit, currentLimit } from "./lib/rate-limit";

const intlMiddleware = createMiddleware(routing);

/**
 * Combined Next.js middleware:
 *   1. Per-IP rate limiting (cheap 429 before hitting upstream)
 *   2. next-intl locale detection & routing
 *   3. x-pathname forwarding so the localised 404 can echo the URL
 *   4. Structured access logging (one JSON line per non-static request)
 *
 * Order matters: rate limit FIRST so abusers don't even cost us a
 * locale-routing decision.
 */
export default function middleware(req: NextRequest) {
  const start = Date.now();
  const ip = clientIp(req);

  // ─── 1. Rate limit ────────────────────────────────────────────────
  // Exempt the two telemetry endpoints:
  //   • /api/vitals — user web-vitals must always land regardless of
  //     burst, otherwise a monitoring storm locks real users out
  //   • /api/log    — error-boundary reports must always land — a buggy
  //     page generating an error storm is precisely the moment we want
  //     the reports to reach us, not 429
  // Both endpoints enforce their own per-call body + count caps so they
  // can't be abused as a DoS vector despite the rate-limit exemption.
  //
  // IMPORTANT: rateLimit() *increments* the bucket, so call it ONCE per
  // request and reuse the result for both the 429 path and the trailing
  // X-RateLimit-* headers on the success path. Calling it twice would
  // double-count and effectively halve the configured budget.
  const path = req.nextUrl.pathname;
  const limit = currentLimit();
  const isTelemetry = path.startsWith("/api/vitals") || path.startsWith("/api/log");
  let rl: ReturnType<typeof rateLimit> | null = null;
  if (!isTelemetry) {
    rl = rateLimit(ip, limit);
    if (!rl.allowed) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After":             String(rl.retryAfterSec),
          "X-RateLimit-Limit":       String(limit),
          "X-RateLimit-Remaining":   "0",
          "X-RateLimit-Reset":       String(Math.ceil(rl.resetMs / 1000)),
        },
      });
    }
  }

  // ─── 2. next-intl ─────────────────────────────────────────────────
  const res = intlMiddleware(req);
  if (res instanceof NextResponse) {
    res.headers.set("x-pathname", path);
    // Surface remaining quota to the client so clients can self-throttle.
    if (rl) {
      res.headers.set("X-RateLimit-Limit",     String(limit));
      res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
      res.headers.set("X-RateLimit-Reset",     String(Math.ceil(rl.resetMs / 1000)));
    }
  }

  // ─── 3. Access log (non-static only) ──────────────────────────────
  // mwMs is the time spent in middleware only — rate-limit decision,
  // intl routing, header rewriting. It is NOT the total response
  // time: the actual route handler runs AFTER middleware returns,
  // and its duration is invisible from here. End-to-end timing
  // belongs in the route handlers themselves or in an instrumentation
  // hook (next.config.ts → instrumentation.ts). Renaming the field
  // from "ms" makes the boundary explicit so dashboards don't
  // misread it as request latency.
  const mwMs = Date.now() - start;
  const status = res instanceof NextResponse ? res.status : 200;
  const isStatic =
    path.startsWith("/_next/") ||
    path.startsWith("/favicon") ||
    /\.(?:png|svg|ico|jpg|jpeg|gif|webp|avif|css|js|woff|woff2|ttf|otf)$/.test(path);

  if (!isStatic) {
    console.log(
      JSON.stringify({
        type: "access",
        ts: new Date().toISOString(),
        method: req.method,
        path,
        status,
        mwMs,
        ip,
        ua: req.headers.get("user-agent")?.slice(0, 120) ?? "-",
      })
    );
  }

  return res;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|woff|woff2|ttf|otf|eot|map|json|txt|xml)$).*)",
  ],
};
