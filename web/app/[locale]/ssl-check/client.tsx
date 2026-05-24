"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type SslResult } from "@/lib/api";
import { LoadingButton, ResultCard } from "@/components/tool-shell";
import { SkeletonCard } from "@/components/skeleton";
import { RecentTargets } from "@/components/recent-targets";
import { useRecentTargets } from "@/lib/use-recent-targets";
import {
  ShieldCheck, ShieldAlert, Lock, AlertCircle, Calendar,
  Clock, KeyRound, Award, Globe, Layers,
} from "lucide-react";
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
  const { recent, remember, forget } = useRecentTargets("ssl-check");

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
    try {
      setData(await api.ssl(host, port));
      remember(host);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  const healthy = data && !data.expired && data.daysUntilExpiry > 14;

  return (
    <div className="space-y-6">
      <form onSubmit={run} noValidate className="card" aria-label={tn("ssl")}>
        <div className="grid gap-3 md:grid-cols-[3fr_1fr_auto]">
          <div className="relative">
            <label htmlFor={hostId} className="sr-only">{tc("enter_host")}</label>
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
              aria-hidden="true"
            />
            <input
              id={hostId}
              className="input pl-11"
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
              className="input text-center font-mono"
              value={port}
              onChange={(e) => setPort(+e.target.value)}
              inputMode="numeric"
            />
          </div>
          <LoadingButton loading={loading} loadingLabel={tc("loading")}>
            {tc("inspect")}
          </LoadingButton>
        </div>
        <RecentTargets
          className="mt-3"
          recent={recent}
          onPick={setHost}
          onForget={forget}
        />
      </form>

      {err && (
        <div
          className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/20"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{err}</span>
        </div>
      )}

      {loading && !data && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {data && (
        <div className="space-y-4" aria-live="polite">
          {/* Hero summary card */}
          <ResultCard
            className={`relative overflow-hidden border-l-4 ${
              healthy ? "border-l-success/50" : "border-l-warn/50"
            }`}
          >
            <div className="flex items-start gap-4">
              <span
                className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                  healthy
                    ? "bg-success/10 text-success ring-success/30"
                    : "bg-warn/10 text-warn ring-warn/30"
                }`}
              >
                {healthy ? (
                  <ShieldCheck className="h-7 w-7" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="h-7 w-7" aria-hidden="true" />
                )}
                {healthy && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-2xl ring-1 ring-success/40 animate-ping-slow preserve-motion"
                  />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated/70 px-2 py-1 text-xs">
                  <Globe className="h-3 w-3 text-violet-soft" aria-hidden="true" />
                  <span className="font-mono text-fg">{data.host}:{data.port}</span>
                </div>
                <div
                  className={`mt-2 text-lg font-semibold sm:text-xl ${
                    healthy ? "text-success" : "text-warn"
                  }`}
                >
                  {healthy ? t("valid") : t("invalid")}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Field
                    icon={<Lock className="h-3.5 w-3.5" />}
                    label={t("field_tls")}
                    value={data.tlsVersion}
                  />
                  <Field
                    icon={<KeyRound className="h-3.5 w-3.5" />}
                    label={t("field_cipher")}
                    value={data.cipherSuite}
                  />
                  <Field
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label={t("field_valid_from")}
                    value={new Date(data.validFrom).toLocaleDateString()}
                  />
                  <Field
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label={t("field_valid_to")}
                    value={new Date(data.validTo).toLocaleDateString()}
                  />
                  <Field
                    icon={<Award className="h-3.5 w-3.5" />}
                    label={t("field_issuer")}
                    value={data.issuer}
                  />
                  <Field
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label={t("field_expiry")}
                    value={
                      <span
                        className={
                          data.expired
                            ? "text-danger"
                            : data.daysUntilExpiry < 14
                              ? "text-warn"
                              : "text-success"
                        }
                      >
                        {data.daysUntilExpiry}
                      </span>
                    }
                  />
                  {data.publicKeyAlgorithm && (
                    <Field
                      icon={<KeyRound className="h-3.5 w-3.5" />}
                      label={t("field_pubkey") || "Public key"}
                      value={
                        <span>
                          {data.publicKeyAlgorithm}
                          {data.publicKeyBits ? ` · ${data.publicKeyBits} bit` : ""}
                          {data.publicKeyCurve ? ` · ${data.publicKeyCurve}` : ""}
                        </span>
                      }
                    />
                  )}
                </div>

                {(data.selfSigned || (data.warnings && data.warnings.length > 0)) && (
                  <ul className="mt-4 space-y-1.5 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs text-warn ring-1 ring-warn/20">
                    {data.selfSigned && (
                      <li className="flex items-center gap-2">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {t("warn_self_signed") || "Certificate is self-signed."}
                      </li>
                    )}
                    {data.warnings?.map((w, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </ResultCard>

          {/* SANs */}
          {data.sans.length > 0 && (
            <ResultCard>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-brand/10 text-violet-soft ring-1 ring-violet-brand/25">
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {t("field_subject_alt")}
                <span className="rounded-md bg-bg-elevated px-2 py-0.5 text-[11px] text-fg-muted ring-1 ring-border">
                  {data.sans.length}
                </span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.sans.map((s) => (
                  <span
                    key={s}
                    className="rounded-lg border border-border bg-bg-elevated px-2 py-1 font-mono text-xs text-fg transition hover:border-violet-brand/40"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </ResultCard>
          )}

          {/* Chain */}
          <ResultCard>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-brand/10 text-violet-soft ring-1 ring-violet-brand/25">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {t("chain")}
              <span className="rounded-md bg-bg-elevated px-2 py-0.5 text-[11px] text-fg-muted ring-1 ring-border">
                {data.chain.length}
              </span>
            </h3>
            <ol className="space-y-2.5">
              {data.chain.map((c, i) => {
                const role =
                  i === 0
                    ? "leaf"
                    : i === data.chain.length - 1
                      ? "root"
                      : "intermediate";
                const roleTone =
                  role === "leaf"
                    ? "bg-success/10 text-success ring-success/25"
                    : role === "root"
                      ? "bg-violet-brand/10 text-violet-soft ring-violet-brand/25"
                      : "bg-bg-elevated text-fg-muted ring-border";
                return (
                  <li
                    key={i}
                    className="rounded-xl border border-border bg-bg-elevated/60 p-3 font-mono text-xs"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-bg-card px-2 py-0.5 text-[11px] font-bold text-fg ring-1 ring-border">
                        #{i + 1}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${roleTone}`}
                      >
                        {role}
                      </span>
                      {c.publicKeyAlgorithm && (
                        <span className="rounded-md border border-border bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                          {c.publicKeyAlgorithm}
                          {c.publicKeyBits ? ` ${c.publicKeyBits}` : ""}
                        </span>
                      )}
                      {c.selfSigned && (
                        <span className="rounded-md border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
                          {t("warn_self_signed_short") || "self-signed"}
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5 text-fg-muted">
                      <div className="break-all">
                        <span className="text-fg-subtle">Subject: </span>
                        <span className="text-fg">{c.subject}</span>
                      </div>
                      <div className="break-all">
                        <span className="text-fg-subtle">Issuer: </span>
                        <span className="text-fg">{c.issuer}</span>
                      </div>
                      <div>
                        <span className="text-fg-subtle">Signature: </span>
                        <span className="text-fg">{c.sigAlg}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </ResultCard>
        </div>
      )}
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-bg-elevated/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        <span className="text-violet-soft/80">{icon}</span>
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-sm text-fg">{value}</div>
    </div>
  );
}
