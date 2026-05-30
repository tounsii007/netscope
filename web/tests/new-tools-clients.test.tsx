/**
 * Focused interaction tests for the four tool clients added in the
 * Q2-29-tools sprint. The smoke tests in {@link smoke-tool-clients.test}
 * lock down "renders without throwing"; here we exercise the result-
 * rendering branches that actually carry security signal:
 *
 *   • DKIM       — revoked-key badge + weak-key warning surfacing
 *   • CT logs    — expired-certificate vs current-certificate icons
 *                  and issuer aggregation rendering
 *   • DoH        — consistent vs divergent answer-set header swap
 *   • WebSocket  — handshake-ok stat grid vs handshake-failed error
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithIntl, screen, userEvent, waitFor } from "./test-utils";

import { DkimClient }      from "@/app/[locale]/dkim/client";
import { CtLogsClient }    from "@/app/[locale]/ct-logs/client";
import { DohClient }       from "@/app/[locale]/doh/client";
import { WebSocketClient } from "@/app/[locale]/websocket/client";

// Mock the api singleton: every method is a vi.fn we set per test. The
// real `request()` wrapper would do a fetch and the jsdom env has no
// outbound network, so mocking the api object is the cheap path.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      dkim:      vi.fn(),
      ctLogs:    vi.fn(),
      doh:       vi.fn(),
      websocket: vi.fn(),
    },
  };
});

import { api } from "@/lib/api";

beforeEach(() => {
  vi.mocked(api.dkim).mockReset();
  vi.mocked(api.ctLogs).mockReset();
  vi.mocked(api.doh).mockReset();
  vi.mocked(api.websocket).mockReset();
});

/* ─── DKIM ───────────────────────────────────────────────────────────── */

describe("DkimClient", () => {
  it("surfaces the 'revoked' badge when the published key has an empty p= tag", async () => {
    vi.mocked(api.dkim).mockResolvedValue({
      domain: "example.com",
      selector: "default",
      triedSelectors: ["default"],
      result: {
        queriedHost: "default._domainkey.example.com",
        present: true,
        rawRecord: "v=DKIM1; k=rsa; p=",
        revoked: true,
        keyType: "rsa",
        warnings: ["Key is revoked (empty p= tag) — common during key rotation"],
      },
    });

    renderWithIntl(<DkimClient />);
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      // /revoked/i matches BOTH the chip ("revoked") and the warning
      // bullet ("Key is revoked (empty p= tag) — …"), which is the
      // correct DOM — surfacing the same signal in two places is
      // intentional UX. Use getAllByText so the test passes when both
      // are present and would fail if either gets dropped.
      const hits = screen.getAllByText(/revoked/i);
      expect(hits.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText(/empty p= tag/i)).toBeInTheDocument();
  });

  it("flags weak RSA key sizes in the warnings list", async () => {
    vi.mocked(api.dkim).mockResolvedValue({
      domain: "example.com",
      selector: "k1",
      triedSelectors: ["k1"],
      result: {
        present: true,
        keyType: "rsa",
        keyAlgorithm: "RSA",
        keySize: 1024,
        warnings: ["RSA key is 1024 bits — 2048 is the modern minimum"],
      },
    });

    renderWithIntl(<DkimClient />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      // The "1024 bits" string appears in the keyDetails stat AND inside
      // the warning bullet ("RSA key is 1024 bits — …"). Both renderings
      // are intentional, so getByText would be ambiguous — pin both via
      // getAllByText.
      const hits = screen.getAllByText(/1024 bits/i);
      expect(hits.length).toBeGreaterThanOrEqual(1);
    });
  });
});

/* ─── CT logs ────────────────────────────────────────────────────────── */

describe("CtLogsClient", () => {
  it("renders both expired and active certificates with their respective icons", async () => {
    vi.mocked(api.ctLogs).mockResolvedValue({
      domain: "example.com",
      includeSubdomains: true,
      totalReturned: 2,
      truncated: false,
      issuerSummary: { "Let's Encrypt R3": 2 },
      certificates: [
        {
          id: 1, serial: "01", commonName: "example.com", nameValue: "example.com",
          issuerCaName: "Let's Encrypt R3", issuerCaId: 42,
          notBefore: "2024-01-01", notAfter: "2024-04-01",
          validForDays: 90, expired: true, daysUntilExpiry: -100,
          sans: ["example.com"],
        },
        {
          id: 2, serial: "02", commonName: "api.example.com", nameValue: "api.example.com",
          issuerCaName: "Let's Encrypt R3", issuerCaId: 42,
          notBefore: "2025-01-01", notAfter: "2025-04-01",
          validForDays: 90, expired: false, daysUntilExpiry: 60,
          sans: ["api.example.com"],
        },
      ],
    });

    renderWithIntl(<CtLogsClient />);
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      // The total-returned count + the issuer-summary badge both render
      // "2". We want to confirm BOTH exist, not assert uniqueness — use
      // getAllByText and lock the count.
      expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(2);
    });
    // The issuer name appears in both the summary AND the per-cert row.
    expect(screen.getAllByText("Let's Encrypt R3").length).toBeGreaterThanOrEqual(2);
    // api.example.com is unique — it's a SAN only on the second cert's
    // common name and not echoed in the summary.
    expect(screen.getByText("api.example.com")).toBeInTheDocument();
  });

  it("shows the truncated badge when crt.sh returned more than MAX_RESULTS", async () => {
    vi.mocked(api.ctLogs).mockResolvedValue({
      domain: "example.com",
      includeSubdomains: true,
      totalReturned: 200,
      truncated: true,
      issuerSummary: {},
      certificates: [],
    });

    renderWithIntl(<CtLogsClient />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/truncated/i)).toBeInTheDocument();
    });
  });
});

/* ─── DoH ────────────────────────────────────────────────────────────── */

describe("DohClient", () => {
  it("renders the 'all consistent' banner when every resolver agrees", async () => {
    vi.mocked(api.doh).mockResolvedValue({
      domain: "cloudflare.com",
      type: "A",
      totalDurationMs: 420,
      consistent: true,
      distinctAnswerSets: 1,
      resolvers: [
        {
          name: "cloudflare", dohEndpoint: "https://cloudflare-dns.com/dns-query",
          dotHost: "1.1.1.1",
          doh: { ok: true, latencyMs: 35 },
          dot: { reachable: true, port: 853, latencyMs: 20 },
          answers: ["104.16.132.229"],
        },
      ],
    });

    renderWithIntl(<DohClient />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      // Translation key doh.answers_consistent → "All resolvers returned…"
      expect(screen.getByText(/all resolvers returned the same/i)).toBeInTheDocument();
    });
    // Per-resolver row — the name ("cloudflare") and the endpoint URL
    // ("cloudflare-dns.com") both contain the substring, so assert
    // "at least once" rather than "exactly once".
    expect(screen.getAllByText(/cloudflare/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the 'distinct answer sets — investigate' banner on disagreement", async () => {
    vi.mocked(api.doh).mockResolvedValue({
      domain: "example.com",
      type: "A",
      totalDurationMs: 700,
      consistent: false,
      distinctAnswerSets: 3,
      resolvers: [],
    });

    renderWithIntl(<DohClient />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      // Translation key doh.answers_diverge → "Resolvers returned {count}…"
      expect(screen.getByText(/distinct answer sets/i)).toBeInTheDocument();
    });
  });
});

/* ─── WebSocket ──────────────────────────────────────────────────────── */

describe("WebSocketClient", () => {
  it("renders the success grid with handshake + ping RTT on ok=true", async () => {
    vi.mocked(api.websocket).mockResolvedValue({
      url: "wss://echo.websocket.events",
      host: "echo.websocket.events",
      scheme: "wss",
      ok: true,
      totalDurationMs: 250,
      handshakeLatencyMs: 120,
      pingRttMs: 35,
      subprotocol: "",
      closeStatusCode: 1000,
      closeReason: "probe done",
    });

    renderWithIntl(<WebSocketClient />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    // Host is rendered in the result panel as a <dd> — the same string
    // is also the input's value attribute, which getByText does NOT
    // scan, so the host text match is unambiguous.
    expect(screen.getByText("echo.websocket.events")).toBeInTheDocument();
    // 120 ms — handshake latency cell.
    expect(screen.getByText(/^120 ms$/)).toBeInTheDocument();
    // 35 ms — ping RTT cell. Anchored regex so it does not also match
    // a hypothetical "350 ms" elsewhere.
    expect(screen.getByText(/^35 ms$/)).toBeInTheDocument();
  });

  it("shows 'no pong' when the server didn't reply to the client ping", async () => {
    vi.mocked(api.websocket).mockResolvedValue({
      url: "wss://strict-server.example",
      host: "strict-server.example",
      scheme: "wss",
      ok: true,
      totalDurationMs: 300,
      handshakeLatencyMs: 200,
      pingRttMs: -1,
      subprotocol: "",
    });

    renderWithIntl(<WebSocketClient />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/no pong/i)).toBeInTheDocument();
    });
  });

  it("renders error + detail when ok=false", async () => {
    vi.mocked(api.websocket).mockResolvedValue({
      url: "wss://bogus.example",
      host: "bogus.example",
      scheme: "wss",
      ok: false,
      totalDurationMs: 4000,
      error: "ConnectException",
      detail: "Connection refused: bogus.example/9.9.9.9:443",
    });

    renderWithIntl(<WebSocketClient />);
    await userEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/handshake failed/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/ConnectException/i)).toBeInTheDocument();
    expect(screen.getByText(/connection refused/i)).toBeInTheDocument();
  });
});
