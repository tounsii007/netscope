"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type RobotsResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export function RobotsClient() {
  const t = useTranslations("robots");
  const tc = useTranslations("common");
  const [host, setHost] = useState("github.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<RobotsResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.robots(host)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex flex-col gap-2 sm:flex-row">
        <input className="input" value={host} onChange={(e) => setHost(e.target.value)} />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("check")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="mb-2 flex items-center gap-2">
              {data.robots.status === 200
                ? <CheckCircle2 className="h-5 w-5 text-success" />
                : <XCircle className="h-5 w-5 text-danger" />}
              <h3 className="font-semibold">{t("robots_txt")}</h3>
              <span className="badge bg-bg-elevated text-xs">HTTP {data.robots.status ?? "?"}</span>
            </div>
            {data.robots.warnings?.map((w, i) => (
              <div key={i} className="mb-1 flex items-start gap-2 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
              </div>
            ))}
            {data.robots.raw && (
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-bg-elevated p-3 font-mono text-xs">
                {data.robots.raw}
              </pre>
            )}
          </ResultCard>

          {data.sitemaps.map((s) => (
            <ResultCard key={s.url}>
              <div className="mb-2 flex items-center gap-2">
                {s.status === 200
                  ? <CheckCircle2 className="h-5 w-5 text-success" />
                  : <XCircle className="h-5 w-5 text-danger" />}
                <h3 className="font-semibold">{t("sitemaps")}</h3>
                <span className="badge bg-bg-elevated text-xs">HTTP {s.status ?? "?"}</span>
                {s.isIndex && <span className="badge bg-brand/10 text-brand text-xs">{t("sitemap_index")}</span>}
              </div>
              <div className="font-mono text-xs text-fg-muted break-all">{s.url}</div>
              {s.urlCount != null && (
                <div className="mt-2 text-sm">
                  <span className="text-2xl font-semibold">{s.urlCount}</span>
                  <span className="text-fg-muted"> {t("urls_label")}</span>
                </div>
              )}
              {s.sample && s.sample.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-fg-muted">{t("sample_urls")}</summary>
                  <ul className="mt-2 space-y-1 font-mono text-xs">
                    {s.sample.map((u) => <li key={u} className="break-all">{u}</li>)}
                  </ul>
                </details>
              )}
              {s.error && <div className="text-sm text-danger">{t("sitemap_errors")}: {s.error}</div>}
            </ResultCard>
          ))}
        </>
      )}
    </div>
  );
}
