"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type WhoisResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";

export function WhoisClient() {
  const t = useTranslations("whois");
  const tc = useTranslations("common");
  const [domain, setDomain] = useState("cloudflare.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<WhoisResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.whois(domain)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} required />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("lookup")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <ResultCard>
            <h3 className="mb-3 text-sm font-semibold">Domain</h3>
            <div className="space-y-2 text-sm">
              <Field label={t("field_name")} value={data.domain} mono />
              <Field label={t("field_handle")} value={data.handle} mono />
              <Field label={t("field_registrar")} value={data.registrar} />
              <div>
                <div className="text-xs uppercase tracking-wide text-fg-subtle">Status</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {data.status.map((s) => <span key={s} className="badge bg-bg-elevated text-fg-muted">{s}</span>)}
                </div>
              </div>
            </div>
          </ResultCard>

          <ResultCard>
            <h3 className="mb-3 text-sm font-semibold">{t("dates")}</h3>
            <div className="space-y-2 text-sm">
              {Object.entries(data.events).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 rounded bg-bg-elevated px-2.5 py-1.5 font-mono text-xs">
                  <span className="text-fg-muted">{k}</span>
                  <span>{v ? new Date(v).toLocaleDateString() : "—"}</span>
                </div>
              ))}
            </div>
          </ResultCard>

          <ResultCard className="md:col-span-2">
            <h3 className="mb-3 text-sm font-semibold">{t("nameservers")}</h3>
            <ul className="space-y-1 font-mono text-sm">
              {data.nameservers.map((ns) => <li key={ns} className="rounded bg-bg-elevated px-3 py-1.5">{ns}</li>)}
            </ul>
          </ResultCard>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={mono ? "font-mono" : ""}>{value ?? "—"}</div>
    </div>
  );
}
