"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type DkimResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle, AlertTriangle, Key } from "lucide-react";

export function DkimClient() {
  const t = useTranslations("dkim");
  const tc = useTranslations("common");
  const [domain, setDomain] = useState("google.com");
  const [sel, setSel] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DkimResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.dkim(domain, sel || undefined)); }
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
          <input
            className="input"
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            placeholder={t("placeholder_selector")}
          />
          <button className="btn" disabled={loading}>
            {loading ? <Spinner /> : tc("analyze")}
          </button>
        </div>
        <p className="text-xs text-fg-muted">{t("selector_hint")}</p>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <ResultCard>
          <header className="mb-4 flex items-center gap-2">
            {data.result.present
              ? <CheckCircle2 className="h-5 w-5 text-success" />
              : <XCircle className="h-5 w-5 text-danger" />}
            <h3 className="font-semibold">
              {data.result.present
                ? t("found_at_selector", { selector: data.selector ?? "?" })
                : t("not_found")}
            </h3>
            {data.result.revoked && (
              <span className="badge bg-warn/10 text-warn">{t("revoked")}</span>
            )}
          </header>

          {data.result.present && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
                <Stat label={t("key_algorithm")} value={data.result.keyAlgorithm ?? data.result.keyType ?? "—"} />
                <Stat
                  label={t("key_size")}
                  value={data.result.keySize ? `${data.result.keySize} ${t("bits")}` : "—"}
                />
                <Stat
                  label={t("hash_algorithms")}
                  value={(data.result.hashAlgorithms ?? []).join(", ") || "—"}
                />
                <Stat label={t("service_type")} value={data.result.serviceType ?? "*"} />
              </div>

              {data.result.rawRecord && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-fg-muted mb-1">
                    <Key className="inline h-3 w-3 mr-1" />
                    {t("raw_record_at", { host: data.result.queriedHost })}
                  </div>
                  <pre className="overflow-auto rounded-md bg-bg-elevated p-3 font-mono text-xs break-all whitespace-pre-wrap">
                    {data.result.rawRecord}
                  </pre>
                </div>
              )}

              {(data.result.warnings ?? []).length > 0 && (
                <ul className="space-y-1 text-sm">
                  {data.result.warnings!.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-warn">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {!data.result.present && (
            <div className="text-sm text-fg-muted">
              <p>{t("tried_selectors")}</p>
              <p className="mt-1 font-mono text-xs">{data.triedSelectors.join(", ")}</p>
            </div>
          )}
        </ResultCard>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg-muted">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
