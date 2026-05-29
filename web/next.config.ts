import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const config: NextConfig = {
  reactStrictMode: true,
  // Hide the "x-powered-by: Next.js" header — small attack-surface win
  // and one fewer fingerprintable signal on every response.
  poweredByHeader: false,
  // Tree-shake icon and map imports so we ship only the components
  // each page actually renders. `next-intl` is also pulled in via the
  // plugin and benefits from the same treatment.
  experimental: {
    optimizePackageImports: ["lucide-react", "react-leaflet", "next-intl"],
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    // Content-Security-Policy notes:
    //
    //   Browsers ENFORCE the CSP of the HTML document — not the CSP of
    //   the individual subresource responses. So this static CSP would
    //   never actually constrain a script load if the rendered HTML
    //   already carries a CSP header (which it does, from middleware.ts
    //   with the per-request nonce).
    //
    //   What this entry STILL achieves:
    //
    //     1. Non-HTML routes that bypass the middleware matcher (the
    //        static-asset prefix, error pages served before
    //        middleware runs, the maintenance/503 page) get a CSP
    //        header so external scanners + automated header-grade
    //        tools report a non-empty policy. Without this entry the
    //        site grades down on "missing CSP" even though the user-
    //        visible HTML enforcement is tight.
    //     2. Defence-in-depth: if a future bug makes the middleware
    //        skip a request (matcher regression, edge runtime error,
    //        Next.js update), the static CSP is the safety net that
    //        still rejects the worst category of attack — inline
    //        scripts from third-party origins — even though
    //        'unsafe-inline' for our OWN content is permitted here.
    //
    //   It does NOT replace the dynamic CSP for HTML — that policy is
    //   stricter (no 'unsafe-inline'). See lib/csp.ts + middleware.ts.
    //
    //   What we keep here:
    //
    //     • frame-src 'none' — make the implicit "no iframes" explicit
    //       (frame-ancestors blocks being framed; frame-src blocks
    //       embedding others). Useful audit signal even though
    //       default-src would catch missing iframes anyway.
    //     • upgrade-insecure-requests stays — silently rewrites any
    //       http:// asset URL the page somehow renders to https://
    //
    //   require-trusted-types-for is NOT enabled until Next.js
    //   officially supports it — adding it now would break SSR
    //   hydration on browsers that enforce it (Chromium-based).
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
      "font-src 'self' fonts.gstatic.com",
      "img-src 'self' data: blob: *.openstreetmap.org *.cartocdn.com tile.openstreetmap.org basemaps.cartocdn.com flagcdn.com",
      "connect-src 'self' " + (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080") + " api.pwnedpasswords.com",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
      // Route violation reports to /api/csp-report (same-origin
      // POST, logged via the structured logger). report-uri is the
      // legacy directive but Firefox/Safari still only honour it;
      // report-to ('csp-endpoint') below is the modern equivalent
      // paired with the Reporting-Endpoints header.
      "report-uri /api/csp-report",
      "report-to csp-endpoint",
    ].join("; ");
    // Permissions-Policy: deny by default for every interface we
    // never use. The opt-in pattern is safer than the deny-known-bad
    // approach — if Chrome ships a new sensor permission tomorrow it
    // is automatically allowed unless we list it here. The keys below
    // cover the full set Chrome 122+ understands and Firefox honours
    // a subset. Browsers ignore unknown keys, so adding extras is
    // forward-compatible.
    const permissionsPolicy = [
      "accelerometer=()",
      "ambient-light-sensor=()",
      "attribution-reporting=()",
      "autoplay=()",
      "battery=()",
      "browsing-topics=()",
      "camera=()",
      "ch-ua-form-factors=()",
      "clipboard-read=()",
      "clipboard-write=(self)",
      "cross-origin-isolated=()",
      "display-capture=()",
      "encrypted-media=()",
      "execution-while-not-rendered=()",
      "execution-while-out-of-viewport=()",
      "fullscreen=(self)",
      "gamepad=()",
      "geolocation=()",
      "gyroscope=()",
      "hid=()",
      "identity-credentials-get=()",
      "idle-detection=()",
      "interest-cohort=()",
      "keyboard-map=()",
      "local-fonts=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "navigation-override=()",
      "otp-credentials=()",
      "payment=()",
      "picture-in-picture=()",
      "publickey-credentials-create=(self)",
      "publickey-credentials-get=(self)",
      "screen-wake-lock=()",
      "serial=()",
      "speaker-selection=()",
      "storage-access=()",
      "sync-xhr=()",
      "unload=()",
      "usb=()",
      "web-share=()",
      "window-management=()",
      "xr-spatial-tracking=()",
    ].join(", ");
    // Reporting-Endpoints lets browsers POST CSP violations (and
    // future report types: deprecation, intervention, crash) to a
    // structured endpoint instead of just dumping them in the
    // console. /api/csp-report is rate-limit-exempt at the edge but
    // caps body size internally so it can't be abused as a DoS sink.
    const reportingEndpoints = `csp-endpoint="/api/csp-report"`;
    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "Reporting-Endpoints", value: reportingEndpoints },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: permissionsPolicy },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      // credentialless (not require-corp) because we embed third-party
      // map tile + flag CDNs that don't send Cross-Origin-Resource-Policy.
      // credentialless still gives us crossOriginIsolated + SharedArrayBuffer
      // capabilities while letting public-asset subresources load
      // without cookies/credentials.
      { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
      // Hints the browser to allocate this origin its own agent
      // cluster (process isolation). Cheap to set, costs us nothing
      // and gates a class of Spectre-style cross-origin leaks.
      { key: "Origin-Agent-Cluster", value: "?1" },
      // Block legacy Flash/Acrobat cross-domain policy lookups so
      // crossdomain.xml on the origin can't be hijacked for old
      // SOP-circumvention. "none" disables them entirely.
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      // Disable DNS prefetching globally. We don't link to external
      // hosts at hover; the few off-origin assets (map tiles, flag
      // CDN) load on demand, not via <a> hover heuristics. Off saves
      // privacy and removes a sidechannel.
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    return [
      // Security headers apply to every route.
      { source: "/(.*)", headers: securityHeaders },
      // Long-cache the immutable build output. Every Next.js asset under
      // /_next/static/* carries a content-hashed filename, so a year-long
      // immutable cache is safe and saves users ~80% of repeat-visit bytes.
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Public icons and favicons rarely change between releases — give
      // browsers a 1-day cache plus a long stale-while-revalidate window
      // so a single edit still propagates within a day.
      {
        source: "/:asset(icon\\.png|icon\\.svg|apple-icon\\.png|favicon\\.ico|manifest\\.webmanifest)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
