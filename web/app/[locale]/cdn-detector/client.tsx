"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type CdnResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { Cloud, CloudOff } from "lucide-react";

export function CdnClient() {
  const t = useTranslations("cdn");
  const tc = useTranslations("common");
  const [host, setHost] = useState("cloudflare.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<CdnResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.cdn(host)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={host} onChange={(e) => setHost(e.target.value)} />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("detect")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="flex items-start gap-4">
              {data.usesCdn
                ? <Cloud className="h-10 w-10 text-brand" />
                : <CloudOff className="h-10 w-10 text-fg-subtle" />}
              <div className="flex-1">
                <div className="font-mono text-sm text-fg-muted">{data.host} → {data.resolvedIp}</div>
                {data.usesCdn ? (
                  <>
                    <div className="mt-2 text-lg">
                      {t("powered_by")} <span className="font-semibold text-brand">{data.cdns.join(" + ")}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {data.cdns.map((c) => (
                        <span key={c} className="badge bg-brand/10 text-brand">{c}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-fg-muted">{t("no_cdn")}</div>
                )}
                {data.server && <div className="mt-2 text-xs font-mono text-fg-subtle">{t("server_label")}: {data.server}</div>}
              </div>
            </div>
          </ResultCard>

          {data.matches.length > 0 && (
            <ResultCard>
              <h3 className="mb-3 text-sm font-semibold">{t("detection_signals")}</h3>
              <ul className="space-y-2 text-sm">
                {data.matches.map((m, i) => (
                  <li key={i} className="flex items-center justify-between rounded-md bg-bg-elevated px-3 py-2">
                    <span>{m.cdn}</span>
                    <code className="font-mono text-xs text-fg-muted">{m.signal}</code>
                  </li>
                ))}
              </ul>
            </ResultCard>
          )}
        </>
      )}
    </div>
  );
}
