"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type SslResult } from "@/lib/api";
import { LoadingButton, ResultCard } from "@/components/tool-shell";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { checkTargetGuard } from "@/lib/target-guard";

export function SslClient() {
  const t = useTranslations("ssl");
  const tc = useTranslations("common");
  const tp = useTranslations("ports");
  const tg = useTranslations("guard");
  const tn = useTranslations("nav.tools");
  const hostId = useId();
  const portId = useId();
  const [host, setHost] = useState("github.com");
  const [port, setPort] = useState(443);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<SslResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    const guard = checkTargetGuard(host);
    if (!guard.ok) {
      setErr(tg(guard.reasonKey));
      setData(null);
      return;
    }
    if (port < 1 || port > 65535) {
      setErr(tp("invalid_port"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.ssl(host, port)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  const healthy = data && !data.expired && data.daysUntilExpiry > 14;

  return (
    <div className="space-y-6">
      <form onSubmit={run} noValidate className="card" aria-label={tn("ssl")}>
        <div className="grid gap-3 md:grid-cols-[3fr_1fr_auto]">
          <div>
            <label htmlFor={hostId} className="sr-only">{tc("enter_host")}</label>
            <input
              id={hostId}
              className="input"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
            />
          </div>
          <div>
            <label htmlFor={portId} className="sr-only">Port</label>
            <input
              id={portId}
              type="number"
              min={1}
              max={65535}
              className="input"
              value={port}
              onChange={(e) => setPort(+e.target.value)}
              inputMode="numeric"
            />
          </div>
          <LoadingButton loading={loading} loadingLabel={tc("loading")}>
            {tc("inspect")}
          </LoadingButton>
        </div>
      </form>

      {err && <div className="card border-danger/50 text-danger" role="alert">{err}</div>}

      {data && (
        <div className="space-y-4" aria-live="polite">
          <ResultCard className={healthy ? "" : "border-warn/50"}>
            <div className="flex items-start gap-3">
              {healthy
                ? <ShieldCheck className="h-8 w-8 text-success" />
                : <ShieldAlert className="h-8 w-8 text-warn" />}
              <div className="flex-1">
                <div className="font-mono text-lg">{data.host}:{data.port}</div>
                <div className="mt-0.5 text-sm text-fg-muted">{healthy ? t("valid") : t("invalid")}</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 text-sm">
                  <Field label={t("field_tls")} value={data.tlsVersion} />
                  <Field label={t("field_cipher")} value={data.cipherSuite} />
                  <Field label={t("field_valid_from")} value={new Date(data.validFrom).toLocaleDateString()} />
                  <Field label={t("field_valid_to")} value={new Date(data.validTo).toLocaleDateString()} />
                  <Field label={t("field_issuer")} value={data.issuer} />
                  <Field label={t("field_expiry")} value={
                    <span className={data.expired ? "text-danger" : data.daysUntilExpiry < 14 ? "text-warn" : "text-success"}>
                      {data.daysUntilExpiry}
                    </span>
                  } />
                </div>
              </div>
            </div>
          </ResultCard>

          <ResultCard>
            <h3 className="mb-3 text-sm font-semibold">{t("field_subject_alt")}</h3>
            <div className="flex flex-wrap gap-2">
              {data.sans.map((s) => (
                <span key={s} className="rounded border border-border bg-bg-elevated px-2 py-0.5 text-xs font-mono">{s}</span>
              ))}
            </div>
          </ResultCard>

          <ResultCard>
            <h3 className="mb-3 text-sm font-semibold">{t("chain")} ({data.chain.length})</h3>
            <ol className="space-y-3">
              {data.chain.map((c, i) => (
                <li key={i} className="rounded-lg border border-border bg-bg-elevated p-3 text-xs font-mono">
                  <div className="text-fg-muted">#{i + 1} {i === 0 ? "(leaf)" : ""}</div>
                  <div className="mt-1 break-all">Subject: {c.subject}</div>
                  <div className="break-all">Issuer: {c.issuer}</div>
                  <div>Signature: {c.sigAlg}</div>
                </li>
              ))}
            </ol>
          </ResultCard>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="font-mono text-sm truncate">{value}</div>
    </div>
  );
}
