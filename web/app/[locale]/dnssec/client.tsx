"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type DnssecResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";

export function DnssecClient() {
  const t = useTranslations("dnssec");
  const tc = useTranslations("common");
  const [domain, setDomain] = useState("cloudflare.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DnssecResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true); setData(null);
    try { setData(await api.dnssec(domain)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} required />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("check")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="flex items-center gap-4">
              {data.signed ? <ShieldCheck className="h-10 w-10 text-success" />
                            : <ShieldAlert className="h-10 w-10 text-warn" />}
              <div>
                <div className="text-2xl font-semibold">{data.signed ? t("active") : t("not_signed")}</div>
                <div className="text-sm text-fg-muted">{data.domain}</div>
              </div>
            </div>
          </ResultCard>

          <div className="grid gap-4 md:grid-cols-3">
            <Stat label={t("stat_ds")} value={data.dsRecords.length} ok={data.dsRecords.length > 0} />
            <Stat label={t("stat_dnskey")} value={data.dnskeyRecords.length} ok={data.dnskeyRecords.length > 0} />
            <Stat label={t("stat_rrsig")} value={data.hasRrsig ? tc("yes") : tc("no")} ok={data.hasRrsig} />
          </div>

          {data.warnings.length > 0 && (
            <ResultCard>
              <h3 className="mb-2 text-sm font-semibold">{t("findings")}</h3>
              <ul className="space-y-1 text-sm">
                {data.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-fg-muted">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" /> {w}
                  </li>
                ))}
              </ul>
            </ResultCard>
          )}

          {data.dsRecords.length > 0 && (
            <ResultCard>
              <h3 className="mb-2 text-sm font-semibold">{t("ds_records")}</h3>
              <pre className="overflow-auto rounded-md bg-bg-elevated p-3 font-mono text-xs">
                {JSON.stringify(data.dsRecords, null, 2)}
              </pre>
            </ResultCard>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: React.ReactNode; ok: boolean }) {
  return (
    <div className="card">
      <div className="text-xs uppercase text-fg-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${ok ? "text-success" : "text-fg-muted"}`}>{value}</div>
    </div>
  );
}
