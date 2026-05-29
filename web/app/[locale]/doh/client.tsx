"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type DohResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const TYPES = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "CAA"] as const;

export function DohClient() {
  const t = useTranslations("doh");
  const tc = useTranslations("common");
  const [domain, setDomain] = useState("cloudflare.com");
  const [type, setType] = useState<(typeof TYPES)[number]>("A");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DohResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.doh(domain, type)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-3">
        <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
          <input
            className="input"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t("placeholder_domain")}
          />
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
          >
            {TYPES.map((typeOption) => (
              <option key={typeOption} value={typeOption}>
                {typeOption}
              </option>
            ))}
          </select>
          <button className="btn" disabled={loading}>
            {loading ? <Spinner /> : tc("analyze")}
          </button>
        </div>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="flex items-center gap-3">
              {data.consistent ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span className="font-medium">{t("answers_consistent")}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-warn" />
                  <span className="font-medium">
                    {t("answers_diverge", { count: data.distinctAnswerSets })}
                  </span>
                </>
              )}
              <span className="ml-auto text-xs text-fg-muted">
                {data.totalDurationMs} ms total
              </span>
            </div>
          </ResultCard>

          {data.resolvers.map((r) => (
            <ResultCard key={r.name}>
              <header className="mb-3 flex items-center gap-2">
                <span className="font-semibold capitalize">{r.name}</span>
                <span className="text-xs text-fg-muted font-mono">{r.dohEndpoint}</span>
              </header>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase text-fg-muted mb-1">DoH</h4>
                  <div className="flex items-center gap-2 text-sm">
                    {r.doh.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-danger" />
                    )}
                    <span>{r.doh.ok ? t("ok") : (r.doh.error ?? t("failed"))}</span>
                    <span className="ml-auto text-fg-muted">{r.doh.latencyMs} ms</span>
                  </div>
                  {r.answers.length > 0 && (
                    <ul className="mt-2 space-y-0.5 font-mono text-xs">
                      {r.answers.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase text-fg-muted mb-1">
                    DoT ({r.dotHost}:{r.dot.port})
                  </h4>
                  <div className="flex items-center gap-2 text-sm">
                    {r.dot.reachable ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-danger" />
                    )}
                    <span>{r.dot.reachable ? t("port_reachable") : (r.dot.error ?? t("blocked"))}</span>
                    <span className="ml-auto text-fg-muted">{r.dot.latencyMs} ms</span>
                  </div>
                </div>
              </div>
            </ResultCard>
          ))}
        </>
      )}
    </div>
  );
}
