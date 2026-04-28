"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type ReachResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle } from "lucide-react";

export function ReachClient() {
  const t = useTranslations("reachability");
  const tc = useTranslations("common");
  const [target, setTarget] = useState("cloudflare.com");
  const [port, setPort] = useState(443);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ReachResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.reach(target, port)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card">
        <div className="grid gap-3 md:grid-cols-[3fr_1fr_auto]">
          <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} />
          <input type="number" className="input" value={port} onChange={(e) => setPort(+e.target.value)} />
          <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("check")}</button>
        </div>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          <Row label="HTTP" ok={data.http?.ok} meta={data.http?.status ? `${data.http.status}` : data.http?.error} latency={data.http?.latencyMs} reachable={t("reachable")} unreachable={t("unreachable")} />
          <Row label={`TCP :${port}`} ok={data.tcp?.ok} meta={data.tcp?.error} latency={data.tcp?.latencyMs} reachable={t("reachable")} unreachable={t("unreachable")} />
          <Row label="Ping" ok={data.ping?.ok} meta={data.ping?.error} latency={data.ping?.latencyMs} reachable={t("reachable")} unreachable={t("unreachable")} />
        </div>
      )}
    </div>
  );
}

function Row({ label, ok, meta, latency, reachable, unreachable }: {
  label: string; ok?: boolean; meta?: string; latency?: number; reachable: string; unreachable: string;
}) {
  return (
    <ResultCard>
      <div className="flex items-center gap-3">
        {ok ? <CheckCircle2 className="h-6 w-6 text-success" /> : <XCircle className="h-6 w-6 text-danger" />}
        <div>
          <div className="font-semibold">{label}</div>
          <div className="text-sm text-fg-muted">
            {ok ? reachable : unreachable}
            {meta && <> · {meta}</>}
            {latency != null && <> · {latency}ms</>}
          </div>
        </div>
      </div>
    </ResultCard>
  );
}
