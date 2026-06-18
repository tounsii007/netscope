"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type WebSocketResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle } from "lucide-react";

export function WebSocketClient() {
  const t = useTranslations("websocket");
  const tc = useTranslations("common");
  const [url, setUrl] = useState("wss://echo.websocket.events");
  const [subprotocol, setSubprotocol] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<WebSocketResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.websocket(url, subprotocol || undefined)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-3">
        <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("placeholder_url")}
          />
          <input
            className="input"
            value={subprotocol}
            onChange={(e) => setSubprotocol(e.target.value)}
            placeholder={t("placeholder_subprotocol")}
          />
          <button className="btn" disabled={loading}>
            {loading ? <Spinner /> : tc("analyze")}
          </button>
        </div>
        <p className="text-xs text-fg-muted">{t("subprotocol_hint")}</p>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <ResultCard>
          <header className="mb-4 flex items-center gap-2">
            {data.ok ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <XCircle className="h-5 w-5 text-danger" />
            )}
            <h3 className="font-semibold">
              {data.ok ? t("handshake_ok") : t("handshake_failed")}
            </h3>
            <span className="ml-auto text-xs text-fg-muted">
              {data.totalDurationMs} ms total
            </span>
          </header>

          {data.ok ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-fg-muted">{t("host")}</dt>
              <dd className="font-mono">{data.host}</dd>
              <dt className="text-fg-muted">{t("scheme")}</dt>
              <dd className="font-mono">{data.scheme}</dd>
              <dt className="text-fg-muted">{t("handshake_latency")}</dt>
              <dd>{data.handshakeLatencyMs} ms</dd>
              <dt className="text-fg-muted">{t("ping_rtt")}</dt>
              <dd>{data.pingRttMs != null && data.pingRttMs >= 0 ? `${data.pingRttMs} ms` : t("no_pong")}</dd>
              <dt className="text-fg-muted">{t("subprotocol_negotiated")}</dt>
              <dd className="font-mono">{data.subprotocol || "—"}</dd>
              {data.closeStatusCode != null && (
                <>
                  <dt className="text-fg-muted">{t("close_status")}</dt>
                  <dd>{data.closeStatusCode}{data.closeReason ? ` — ${data.closeReason}` : ""}</dd>
                </>
              )}
            </dl>
          ) : (
            <div className="text-sm">
              <p className="text-danger">{data.error}</p>
              {data.detail && <p className="mt-1 text-fg-muted text-xs font-mono">{data.detail}</p>}
            </div>
          )}
        </ResultCard>
      )}
    </div>
  );
}
