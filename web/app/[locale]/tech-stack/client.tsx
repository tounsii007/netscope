"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type TechResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";

export function TechClient() {
  const t = useTranslations("tech");
  const tc = useTranslations("common");
  const [host, setHost] = useState("vercel.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<TechResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true); setData(null);
    try { setData(await api.tech(host)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={host} onChange={(e) => setHost(e.target.value)} required />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("detect")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="text-3xl font-semibold">{data.totalDetected}</div>
            <div className="text-sm text-fg-muted">{t("detected", { count: data.totalDetected })}</div>
          </ResultCard>

          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(data.technologies).map(([cat, techs]) => (
              <ResultCard key={cat}>
                <h3 className="mb-2 text-xs font-semibold uppercase text-fg-subtle">{cat}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {techs.map((tp) => (
                    <span key={tp} className="badge bg-brand/10 text-brand">{tp}</span>
                  ))}
                </div>
              </ResultCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
