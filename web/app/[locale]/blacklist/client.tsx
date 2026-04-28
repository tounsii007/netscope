"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type BlacklistResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle } from "lucide-react";

export function BlacklistClient() {
  const t = useTranslations("blacklist");
  const tc = useTranslations("common");
  const [ip, setIp] = useState("8.8.8.8");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<BlacklistResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.blacklist(ip)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex flex-col gap-2 sm:flex-row">
        <input className="input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder={t("placeholder")} />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("check")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="flex items-center gap-6">
              <div className="text-6xl font-bold" style={{
                color: data.clean ? "#10b981" : data.listedCount < 3 ? "#f59e0b" : "#ef4444"
              }}>
                {data.reputationScore}
              </div>
              <div>
                <div className="text-xl">
                  {data.clean ? t("clean") : t("listed_on", { listed: data.listedCount, total: data.totalChecked })}
                </div>
                <div className="text-sm font-mono text-fg-muted">{data.ip} · {data.durationMs}ms</div>
              </div>
            </div>
          </ResultCard>

          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-elevated text-left text-xs uppercase text-fg-muted">
                  <th className="px-3 py-2">{t("col_list")}</th>
                  <th className="px-3 py-2 text-right">{t("col_status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.list} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{r.list}</td>
                    <td className="px-3 py-2 text-right">
                      {r.listed
                        ? <span className="inline-flex items-center gap-1 text-danger"><XCircle className="h-3.5 w-3.5" /> {t("status_listed")} {r.responseCodes?.join(" ")}</span>
                        : <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> {t("status_clean")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
