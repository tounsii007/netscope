import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("*/api/v1/port/check", async ({ request }) => {
    const body = (await request.json()) as { target: string; port: number };
    return HttpResponse.json({
      target: body.target, resolvedIp: "1.2.3.4", port: body.port,
      protocol: "tcp", open: body.port === 443, latencyMs: 42,
      service: body.port === 443 ? "https" : null, error: null,
    });
  }),
  http.get("*/api/v1/dns/:domain", ({ params }) => HttpResponse.json({
    domain: params.domain, durationMs: 12,
    records: { A: ["93.184.216.34"], AAAA: [], MX: [], TXT: [], NS: ["a.iana-servers.net."] },
  })),
];

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
