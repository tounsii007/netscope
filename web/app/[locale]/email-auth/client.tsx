"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type EmailAuthResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export function EmailAuthClient() {
  const t = useTranslations("email_auth");
  const tc = useTranslations("common");
  const [domain, setDomain] = useState("google.com");
  const [sel, setSel] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<EmailAuthResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true); setData(null);
    try { setData(await api.emailAuth(domain, sel || undefined)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-3">
        <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
          <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t("placeholder_domain")} required />
          <input className="input" value={sel} onChange={(e) => setSel(e.target.value)} placeholder={t("placeholder_selector")} />
          <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("analyze")}</button>
        </div>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="flex items-center gap-6">
              <div className="text-6xl font-bold text-brand">{data.score}<span className="text-lg text-fg-muted">/100</span></div>
              <div>
                <div className="text-xl">{t("score_label")}</div>
                <div className="text-sm text-fg-muted">{data.domain}</div>
              </div>
            </div>
          </ResultCard>

          <Section title="SPF" present={data.spf.present} record={data.spf.record}
            warnings={data.spf.warnings} extras={[data.spf.strict ? "Strict (-all)" : undefined]} />
          <Section title="DMARC" present={data.dmarc.present} record={data.dmarc.record}
            warnings={data.dmarc.warnings}
            extras={[data.dmarc.policy && `Policy: ${data.dmarc.policy}`, data.dmarc.reportingTo && `Reports: ${data.dmarc.reportingTo}`]} />
          <Section title="DKIM" present={data.dkim.present} record={data.dkim.record}
            warnings={data.dkim.warnings ?? []}
            extras={[data.dkim.selector && `Selector: ${data.dkim.selector}`]} />
        </>
      )}
    </div>
  );
}

function Section({ title, present, record, warnings, extras }: {
  title: string; present: boolean; record?: string; warnings: string[]; extras?: Array<string | undefined | false>;
}) {
  return (
    <ResultCard>
      <div className="mb-3 flex items-center gap-2">
        {present ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-danger" />}
        <h3 className="font-semibold">{title}</h3>
        {(extras ?? []).filter(Boolean).map((e, i) => (
          <span key={i} className="badge bg-bg-elevated text-fg-muted text-xs">{e}</span>
        ))}
      </div>
      {record && (
        <pre className="mb-2 overflow-auto rounded-md bg-bg-elevated p-3 font-mono text-xs break-all whitespace-pre-wrap">{record}</pre>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1 text-sm">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-warn">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
    </ResultCard>
  );
}
