"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type CookieResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";

export function CookieClient() {
  const t = useTranslations("cookies");
  const tc = useTranslations("common");
  const [url, setUrl] = useState("https://example.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<CookieResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true); setData(null);
    try { setData(await api.cookies(url)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("analyze")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-bold" style={{
                color: data.gdprRiskScore < 30 ? "#10b981" : data.gdprRiskScore < 60 ? "#f59e0b" : "#ef4444"
              }}>{data.gdprRiskScore}</div>
              <div>
                <div className="text-xl">{t("gdpr_score")}</div>
                <div className="text-sm text-fg-muted">
                  {t("summary", { cookies: data.cookieCount, trackers: data.trackerCount, hosts: data.thirdPartyHosts.length })}
                </div>
              </div>
            </div>
          </ResultCard>

          {data.cookies.length > 0 && (
            <ResultCard>
              <h3 className="mb-2 text-sm font-semibold">{t("section_cookies")}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-fg-muted">
                    <th className="px-2 py-1">{t("col_name")}</th>
                    <th className="px-2 py-1">{t("col_secure")}</th>
                    <th className="px-2 py-1">{t("col_httponly")}</th>
                    <th className="px-2 py-1">{t("col_samesite")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cookies.map((c, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-2 py-1 font-mono text-xs">{c.name ?? "—"}</td>
                      <td className="px-2 py-1">{c.secure ? "✓" : <span className="text-danger">✗</span>}</td>
                      <td className="px-2 py-1">{c.httpOnly ? "✓" : <span className="text-warn">✗</span>}</td>
                      <td className="px-2 py-1 font-mono text-xs">{c.sameSite ?? <span className="text-warn">none</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResultCard>
          )}

          {data.trackers.length > 0 && (
            <ResultCard>
              <h3 className="mb-2 text-sm font-semibold">{t("section_trackers")}</h3>
              <div className="flex flex-wrap gap-2">
                {data.trackers.map((tr) => (
                  <span key={tr.name} className="badge bg-warn/10 text-warn">{tr.name} · {tr.category}</span>
                ))}
              </div>
            </ResultCard>
          )}
        </>
      )}
    </div>
  );
}
