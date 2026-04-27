"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type Ipv6Result } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle, AlertTriangle, ServerCrash } from "lucide-react";
import { normaliseHost } from "@/lib/normalise-host";

/**
 * A response with EVERY DNS field empty is almost always a non-existent
 * domain (NXDOMAIN). Returning 0/100 with six red ✗ rows is technically
 * correct but misleading — the user thinks their domain "fails IPv6"
 * when in fact the domain doesn't exist. We detect this and show a
 * clearer message.
 */
function looksUnresolved(d: Ipv6Result): boolean {
  return !d.apex.a && !d.apex.aaaa
      && !d.www.a  && !d.www.aaaa
      && d.nameservers.total === 0
      && d.mxRecords.total === 0;
}

export function Ipv6Client() {
  const t = useTranslations("ipv6");
  const tc = useTranslations("common");
  const [domain, setDomain] = useState("google.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Ipv6Result | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    // Strip scheme/path users may have pasted (e.g. "https://www.bahnhof.de/x")
    const cleaned = normaliseHost(domain);
    if (cleaned !== domain) setDomain(cleaned);
    if (!cleaned) { setErr(tc("input_required")); setData(null); return; }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.ipv6(cleaned)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  const unresolved = data && looksUnresolved(data);

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input
          className="input"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onBlur={(e) => setDomain(normaliseHost(e.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("score")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {/* Domain doesn't exist — show ONE clear message instead of the
          confusing 0/100 score with six red ✗ rows. */}
      {unresolved && (
        <div className="card border-danger/50 bg-danger/5 flex items-start gap-3">
          <ServerCrash className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-danger">{t("nxdomain_title")}</div>
            <div className="mt-1 text-sm text-fg-muted">
              {t("nxdomain_message", { domain: data!.domain })}
            </div>
            <ul className="mt-3 list-disc list-inside text-sm text-fg-muted space-y-0.5">
              <li>{t("nxdomain_hint_typo")}</li>
              <li>{t("nxdomain_hint_scheme")}</li>
              <li>{t("nxdomain_hint_resolver")}</li>
            </ul>
          </div>
        </div>
      )}

      {data && !unresolved && (
        <>
          <ResultCard>
            <div className="flex items-center gap-6">
              <div className="text-6xl font-bold" style={{
                color: data.score >= 80 ? "#10b981" : data.score >= 40 ? "#f59e0b" : "#ef4444"
              }}>{data.score}<span className="text-lg text-fg-muted">/100</span></div>
              <div>
                <div className="text-xl">{t("grade")}</div>
                <div className="text-sm text-fg-muted">{data.domain}</div>
              </div>
            </div>
          </ResultCard>

          <div className="grid gap-4 md:grid-cols-2">
            <Row label={t("row_apex_a")}    ok={data.apex.a} />
            <Row label={t("row_apex_aaaa")} ok={data.apex.aaaa} />
            <Row label={t("row_www_a")}     ok={data.www.a} />
            <Row label={t("row_www_aaaa")}  ok={data.www.aaaa} />
            <Row label={t("row_ns", { with: data.nameservers.withIpv6, total: data.nameservers.total })}
              ok={data.nameservers.total > 0 && data.nameservers.withIpv6 === data.nameservers.total} />
            <Row label={t("row_mx", { with: data.mxRecords.withIpv6, total: data.mxRecords.total })}
              ok={data.mxRecords.total > 0 && data.mxRecords.withIpv6 === data.mxRecords.total} />
          </div>

          {data.warnings.length > 0 && (
            <ResultCard>
              <h3 className="mb-2 text-sm font-semibold">{t("warnings")}</h3>
              <ul className="space-y-1 text-sm">
                {data.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-warn">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            </ResultCard>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="card flex items-center gap-3">
      {ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-danger" />}
      <span>{label}</span>
    </div>
  );
}
