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
    //   script-src / style-src include 'unsafe-inline' because Next.js
    //   injects inline bootstrap scripts (hydration, runtime config)
    //   and Tailwind injects inline <style> tags. A proper fix
    //   requires a per-request nonce generated in middleware and
    //   threaded through `headers().get('x-nonce')` in every layout
    //   plus every `<Script>` and Tailwind output — tracked separately
    //   as a larger refactor.
    //
    //   What we can tighten without a downstream rewrite:
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
    ].join("; ");
    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      // Block legacy Flash/Acrobat cross-domain policy lookups so
      // crossdomain.xml on the origin can't be hijacked for old
      // SOP-circumvention. "none" disables them entirely.
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
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
