"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type PropagationResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle } from "lucide-react";

const TYPES = ["A", "AAAA", "MX", "TXT", "NS", "CNAME"];

export function PropagationClient() {
  const t = useTranslations("propagation");
  const tc = useTranslations("common");
  const [domain, setDomain] = useState("example.com");
  const [type, setType] = useState("A");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<PropagationResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.propagation(domain, type)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-3">
        <div className="flex gap-2">
          <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} required />
          <select className="input max-w-[7rem]" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
          </select>
          <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("check")}</button>
        </div>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t("stat_resolvers")} value={data.resolverCount} />
            <Stat label={t("stat_unique")} value={data.uniqueAnswers}
              tone={data.uniqueAnswers === 1 ? "ok" : data.uniqueAnswers <= 2 ? "warn" : "err"} />
            <Stat label={t("stat_status")} value={data.fullyPropagated ? t("propagated") : t("propagating")}
              tone={data.fullyPropagated ? "ok" : "warn"} />
          </div>

          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-elevated text-left text-xs uppercase text-fg-muted">
                  <th className="px-3 py-2">{t("col_resolver")}</th>
                  <th className="px-3 py-2">{t("col_region")}</th>
                  <th className="px-3 py-2">{t("col_answer")}</th>
                  <th className="px-3 py-2 text-right">{t("col_ms")}</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.ip} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              : <XCircle className="h-3.5 w-3.5 text-danger" />}
                        <span className="font-medium">{r.resolver}</span>
                        <span className="text-xs font-mono text-fg-subtle">{r.ip}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-fg-muted">{r.region}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.error ? <span className="text-danger">{r.error}</span>
                        : r.values?.length ? r.values.join(", ") : <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">{r.latencyMs}</td>
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

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "err" }) {
  const color = tone === "ok" ? "text-success" : tone === "warn" ? "text-warn" : tone === "err" ? "text-danger" : "";
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
