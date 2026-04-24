"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type MixedResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export function MixedClient() {
  const t = useTranslations("mixed");
  const tc = useTranslations("common");
  const [url, setUrl] = useState("https://example.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<MixedResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true); setData(null);
    try { setData(await api.mixedContent(url)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder={t("placeholder")} />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("scan")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard className={data.clean ? "border-success/50" : "border-danger/50"}>
            <div className="flex items-center gap-4">
              {data.clean
                ? <CheckCircle2 className="h-10 w-10 text-success" />
                : <AlertTriangle className="h-10 w-10 text-danger" />}
              <div>
                <div className="text-2xl font-semibold">
                  {data.clean ? t("clean") : t("insecure_count", { count: data.totalInsecureResources })}
                </div>
                <div className="text-sm text-fg-muted">
                  {data.blockingResources} blocking · {data.passiveResources} passive
                </div>
              </div>
            </div>
          </ResultCard>

          {data.warnings.length > 0 && (
            <ResultCard>
              <ul className="space-y-1 text-sm">
                {data.warnings.map((w, i) => <li key={i} className="text-fg-muted">{w}</li>)}
              </ul>
            </ResultCard>
          )}

          {Object.entries(data.byType).map(([type, urls]) => (
            <ResultCard key={type}>
              <h3 className="mb-2 text-sm font-semibold">
                <code className="text-brand">&lt;{type}&gt;</code>
                <span className="ml-2 text-xs text-fg-muted">{urls.length}</span>
              </h3>
              <ul className="space-y-1 font-mono text-xs">
                {urls.map((u, i) => (
                  <li key={i} className="break-all rounded bg-bg-elevated px-2 py-1 text-danger">{u}</li>
                ))}
              </ul>
            </ResultCard>
          ))}
        </>
      )}
    </div>
  );
}
