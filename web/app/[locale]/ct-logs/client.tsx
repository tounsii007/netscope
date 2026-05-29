"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type CtLogsResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { AlertTriangle, ShieldCheck } from "lucide-react";

export function CtLogsClient() {
  const t = useTranslations("ct_logs");
  const tc = useTranslations("common");
  const [domain, setDomain] = useState("github.com");
  const [includeSubs, setIncludeSubs] = useState(true);
  const [excludeExpired, setExcludeExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<CtLogsResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.ctLogs(domain, includeSubs, excludeExpired)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-3">
        <div className="grid gap-2 md:grid-cols-[2fr_auto]">
          <input
            className="input"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t("placeholder_domain")}
          />
          <button className="btn" disabled={loading}>
            {loading ? <Spinner /> : tc("analyze")}
          </button>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeSubs}
              onChange={(e) => setIncludeSubs(e.target.checked)}
            />
            {t("include_subdomains")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={excludeExpired}
              onChange={(e) => setExcludeExpired(e.target.checked)}
            />
            {t("exclude_expired")}
          </label>
        </div>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="mb-3 flex items-baseline gap-3">
              <div className="text-3xl font-bold">{data.totalReturned}</div>
              <div className="text-sm text-fg-muted">
                {t("certificates_for", { domain: data.domain })}
                {data.truncated && <span className="ml-2 badge bg-warn/10 text-warn">{t("truncated")}</span>}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">{t("issuers")}</h4>
              <ul className="space-y-1 text-sm">
                {Object.entries(data.issuerSummary).map(([issuer, count]) => (
                  <li key={issuer} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{issuer}</span>
                    <span className="badge bg-bg-elevated text-fg-muted">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ResultCard>

          <ResultCard>
            <h4 className="text-sm font-semibold mb-3">{t("certificates")}</h4>
            <div className="space-y-3 text-sm">
              {data.certificates.map((c) => (
                <article key={c.id} className="rounded-md border border-border p-3">
                  <header className="mb-2 flex items-center gap-2">
                    {c.expired
                      ? <AlertTriangle className="h-4 w-4 text-warn" />
                      : <ShieldCheck className="h-4 w-4 text-success" />}
                    <strong className="truncate">{c.commonName ?? c.sans[0] ?? "(unknown)"}</strong>
                    <span className="ml-auto text-xs text-fg-muted">
                      {c.expired
                        ? t("expired_n_days_ago", { n: Math.abs(c.daysUntilExpiry) })
                        : t("expires_in_n_days", { n: c.daysUntilExpiry })}
                    </span>
                  </header>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-fg-muted">{t("issuer")}</dt>
                    <dd className="truncate">{c.issuerCaName}</dd>
                    <dt className="text-fg-muted">{t("not_before")}</dt>
                    <dd>{c.notBefore}</dd>
                    <dt className="text-fg-muted">{t("not_after")}</dt>
                    <dd>{c.notAfter}</dd>
                    <dt className="text-fg-muted">{t("valid_for")}</dt>
                    <dd>{c.validForDays} {t("days")}</dd>
                  </dl>
                  {c.sans.length > 1 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-fg-muted">
                        {t("n_sans", { n: c.sans.length })}
                      </summary>
                      <ul className="mt-1 space-y-0.5 font-mono text-xs">
                        {c.sans.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </ResultCard>
        </>
      )}
    </div>
  );
}
