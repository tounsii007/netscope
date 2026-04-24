"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type PortCheckResult, type PortScanResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle } from "lucide-react";

type Mode = "single" | "common" | "range";

export function PortCheckerClient() {
  const t = useTranslations("ports");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<Mode>("single");
  const [target, setTarget] = useState("google.com");
  const [port, setPort] = useState(443);
  const [fromPort, setFromPort] = useState(20);
  const [toPort, setToPort] = useState(100);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [single, setSingle] = useState<PortCheckResult | null>(null);
  const [scan, setScan] = useState<PortScanResult | null>(null);

  const modeLabel = (m: Mode) => m === "common" ? t("mode_common") : m === "range" ? t("mode_range") : t("mode_single");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true); setSingle(null); setScan(null);
    try {
      if (mode === "single") setSingle(await api.portCheck(target, port));
      else if (mode === "common") setScan(await api.portScan(target, { commonOnly: true }));
      else setScan(await api.portScan(target, { fromPort, toPort }));
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-4">
        <div className="flex gap-1 rounded-lg bg-bg-elevated p-1">
          {(["single", "common", "range"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm capitalize transition ${
                mode === m ? "bg-brand text-white" : "text-fg-muted hover:text-fg"
              }`}>{modeLabel(m)}</button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <input className="input" placeholder={t("placeholder_host")}
            value={target} onChange={(e) => setTarget(e.target.value)} required />
          {mode === "single" && (
            <input type="number" min={1} max={65535} className="input"
              value={port} onChange={(e) => setPort(+e.target.value)} required />
          )}
          {mode === "range" && (
            <div className="flex gap-2">
              <input type="number" className="input" value={fromPort} onChange={(e) => setFromPort(+e.target.value)} />
              <input type="number" className="input" value={toPort} onChange={(e) => setToPort(+e.target.value)} />
            </div>
          )}
          {mode === "common" && <div className="text-sm text-fg-muted self-center">20 common ports</div>}
          <button className="btn" disabled={loading}>
            {loading ? <Spinner /> : tc("check")}
          </button>
        </div>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {single && (
        <ResultCard>
          <div className="flex items-center gap-3">
            {single.open
              ? <CheckCircle2 className="h-8 w-8 text-success" />
              : <XCircle className="h-8 w-8 text-danger" />}
            <div>
              <div className="text-lg font-medium">
                Port {single.port} is <span className={single.open ? "text-success" : "text-danger"}>
                  {single.open ? t("open").toUpperCase() : t("closed").toUpperCase()}
                </span>
              </div>
              <div className="font-mono text-sm text-fg-muted">
                {single.target} → {single.resolvedIp}
                {single.latencyMs != null && <> · {single.latencyMs}ms</>}
                {single.service && <> · {single.service}</>}
              </div>
            </div>
          </div>
        </ResultCard>
      )}

      {scan && (
        <ResultCard>
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <div className="text-sm text-fg-muted">{scan.target} → {scan.resolvedIp}</div>
              <div className="text-lg">
                <span className="text-success font-semibold">{scan.openCount}</span>
                <span className="text-fg-muted"> / {scan.totalChecked} {t("open")}</span>
              </div>
            </div>
            <div className="text-xs text-fg-muted">{scan.totalMs}ms</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {scan.results.map((r) => (
              <div key={r.port}
                className={`rounded-lg border px-3 py-2 text-sm font-mono ${
                  r.open ? "border-success/40 bg-success/5" : "border-border bg-bg-elevated"
                }`}>
                <div className="flex items-center justify-between">
                  <span>{r.port}</span>
                  <span className={r.open ? "text-success text-xs" : "text-fg-subtle text-xs"}>
                    {r.open ? t("open") : "—"}
                  </span>
                </div>
                {r.service && <div className="text-xs text-fg-muted">{r.service}</div>}
              </div>
            ))}
          </div>
        </ResultCard>
      )}
    </div>
  );
}
