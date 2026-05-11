import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

/**
 * MSW handlers — one per backend endpoint that frontend tests need to
 * exercise. Keep response shapes in sync with `web/lib/api.ts` types so
 * client tests can rely on stable, deterministic data.
 */
export const handlers = [
  /* ── port checker ───────────────────────────────────────────────────── */
  http.post("*/api/v1/port/check", async ({ request }) => {
    const body = (await request.json()) as { target: string; port: number };
    return HttpResponse.json({
      target: body.target, resolvedIp: "1.2.3.4", port: body.port,
      protocol: "tcp", open: body.port === 443, latencyMs: 42,
      service: body.port === 443 ? "https" : null, error: null,
    });
  }),
  http.post("*/api/v1/port/scan", async () => HttpResponse.json({
    target: "google.com", resolvedIp: "1.2.3.4", openCount: 2, totalChecked: 20,
    totalMs: 320,
    results: [
      { port: 80,  open: true,  service: "http"  },
      { port: 443, open: true,  service: "https" },
      { port: 22,  open: false, service: "ssh"   },
    ],
  })),

  /* ── DNS ────────────────────────────────────────────────────────────── */
  http.get("*/api/v1/dns/:domain", ({ params }) => HttpResponse.json({
    domain: params.domain, durationMs: 12,
    records: { A: ["93.184.216.34"], AAAA: [], MX: [], TXT: [], NS: ["a.iana-servers.net."] },
  })),

  /* ── WHOIS ──────────────────────────────────────────────────────────── */
  http.get("*/api/v1/whois/:domain", ({ params }) => HttpResponse.json({
    domain: params.domain, handle: "EX-2025", registrar: "Acme Registrar Inc.",
    status: ["clientTransferProhibited", "serverDeleteProhibited"],
    events: { created: "2010-01-01T00:00:00Z", updated: "2024-01-01T00:00:00Z", expires: "2030-01-01T00:00:00Z" },
    nameservers: ["ns1.acme.example", "ns2.acme.example"],
  })),

  /* ── robots / sitemap ───────────────────────────────────────────────── */
  http.get("*/api/v1/robots/:host", ({ params }) => HttpResponse.json({
    host: params.host,
    robots: {
      status: 200,
      raw: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
      warnings: [],
    },
    sitemaps: [{
      url: `https://${params.host}/sitemap.xml`,
      status: 200, isIndex: false, urlCount: 42,
      sample: ["/page-a", "/page-b", "/page-c"],
      error: null,
    }],
  })),

  /* ── client-side logging beacons ────────────────────────────────────── */
  // Unit tests aren't validating the log/vitals payloads themselves; we
  // just need MSW to acknowledge the requests so `onUnhandledRequest:
  // "error"` doesn't fail any test that triggers an error boundary or
  // emits a Web Vitals beacon (the error boundary now POSTs to /api/log
  // for production observability — see app/[locale]/error.tsx).
  http.post("*/api/log",    () => HttpResponse.json({ ok: true })),
  http.post("*/api/vitals", () => HttpResponse.json({ ok: true, recorded: 0 })),
];

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
