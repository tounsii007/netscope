import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { type NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);

/**
 * Combined middleware:
 *  1. HTTP access logging → access.YYYY-MM-DD.log (server-side only)
 *  2. next-intl locale detection & routing
 */
export default function middleware(req: NextRequest) {
  const start = Date.now();
  const res = intlMiddleware(req);

  // Forward the original pathname to downstream Server Components so the
  // not-found page can render the URL the user actually typed.  next-intl's
  // middleware rewrites the URL internally (adding /<locale>/), so RSCs
  // can't see the original via headers without us echoing it here.
  if (res instanceof NextResponse) {
    res.headers.set("x-pathname", req.nextUrl.pathname);
  }

  // Log after intl middleware resolves (non-blocking — fire & forget)
  // We write directly to stdout in a structured format; the PM2 / Docker
  // log driver picks it up, and the Node.js logger in lib/logger.ts
  // captures it when running inside the Next.js Node runtime.
  const ms = Date.now() - start;
  const status = res instanceof NextResponse ? res.status : 200;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // Suppress noisy static-asset requests from access log
  const path = req.nextUrl.pathname;
  const isStatic =
    path.startsWith("/_next/") ||
    path.startsWith("/favicon") ||
    path.endsWith(".ico") ||
    path.endsWith(".png") ||
    path.endsWith(".svg");

  if (!isStatic) {
    // Structured JSON line — parsed by logger in Node.js process via stdout
    console.log(
      JSON.stringify({
        type:    "access",
        ts:      new Date().toISOString(),
        method:  req.method,
        path,
        status,
        ms,
        ip,
        ua:      req.headers.get("user-agent")?.slice(0, 120) ?? "-",
      })
    );
  }

  return res;
}

export const config = {
  matcher: [
    // Match every path EXCEPT:
    //  • Next.js internals (_next/static, _next/image)
    //  • Top-level static files served from app/ or public/ — favicon,
    //    icon.png, apple-icon, robots.txt, sitemap.xml, manifest, etc.
    //  • Anything with a file extension (.png, .svg, .ico, .jpg, .css,
    //    .js, .woff, .woff2, .json, .txt, .xml, .map, .webp, .avif).
    //    Without this, next-intl rewrites /icon.png → /de/icon.png,
    //    which 404s because the file is only served from the root.
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|woff|woff2|ttf|otf|eot|map|json|txt|xml)$).*)",
  ],
};
