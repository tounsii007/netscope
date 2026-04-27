"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type RedirectResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { ArrowRight, AlertTriangle } from "lucide-react";

export function RedirectsClient() {
  const t = useTranslations("redirects");
  const tc = useTranslations("common");
  const [url, setUrl] = useState("http://google.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<RedirectResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.redirects(url)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("trace")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label={t("stat_hops")} value={data.hopCount} />
              <Stat label={t("stat_final_status")} value={data.finalStatusCode} />
              <Stat label={t("stat_downgrade")} value={data.httpsDowngrade ? t("downgrade_yes") : t("downgrade_no")} tone={data.httpsDowngrade ? "err" : "ok"} />
              <Stat label={t("stat_result")} value={data.finalStatus} />
            </div>
            {data.warnings.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm">
                {data.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-warn">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            )}
          </ResultCard>

          <ResultCard>
            <ol className="space-y-2">
              {data.hops.map((h) => (
                <li key={h.hop} className="rounded-lg border border-border bg-bg-elevated p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="badge bg-brand/10 text-brand">#{h.hop}</span>
                    <span className={`badge ${h.status >= 200 && h.status < 300 ? "bg-success/15 text-success"
                      : h.status >= 300 && h.status < 400 ? "bg-warn/15 text-warn"
                      : "bg-danger/15 text-danger"}`}>{h.status}</span>
                    <span className="font-mono text-xs text-fg-subtle">{h.latencyMs}ms</span>
                  </div>
                  <div className="mt-1 break-all font-mono text-xs">{h.url}</div>
                  {h.location && (
                    <div className="mt-1 flex items-start gap-1 font-mono text-xs text-fg-muted">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="break-all">{h.location}</span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </ResultCard>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "err" }) {
  const c = tone === "ok" ? "text-success" : tone === "err" ? "text-danger" : "";
  return (
    <div>
      <div className="text-xs uppercase text-fg-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}
