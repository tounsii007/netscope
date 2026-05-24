"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type WhoisResult } from "@/lib/api";
import { LoadingButton, ResultCard } from "@/components/tool-shell";
import { RecentTargets } from "@/components/recent-targets";
import { ShareLink } from "@/components/share-link";
import { useRecentTargets } from "@/lib/use-recent-targets";
import { useDeepLink } from "@/lib/use-deep-link";
import { isHostname, validateInput } from "@/lib/input-validators";
import { InputStatus } from "@/components/input-status";
import {
  Server, AlertCircle, Building2, Calendar, Globe2, Hash,
} from "lucide-react";

export function WhoisClient() {
  const t = useTranslations("whois");
  const tc = useTranslations("common");
  const tn = useTranslations("nav.tools");
  const [domain, setDomain] = useState("cloudflare.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<WhoisResult | null>(null);
  const { recent, remember, forget } = useRecentTargets("whois");
  const { buildUrl, pushUrl } = useDeepLink({
    setTarget: setDomain,
    onAutoRun: () => { run({ preventDefault: () => {} } as unknown as React.FormEvent); },
  });
  const hostStatus = useMemo(
    () => validateInput(domain, isHostname, tc("invalid_host_shape")),
    [domain, tc],
  );

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try {
      setData(await api.whois(domain));
      remember(domain);
      pushUrl(domain);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={run}
        className="card space-y-3"
        aria-label={tn("whois")}
      >
       <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Server
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
            aria-hidden="true"
          />
          <input
            className="input pl-11"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            aria-label={tc("enter_domain")}
          />
        </div>
        <LoadingButton loading={loading} loadingLabel={tc("loading")}>
          {tc("lookup")}
        </LoadingButton>
       </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <RecentTargets recent={recent} onPick={setDomain} onForget={forget} currentValue={domain} />
            <InputStatus result={hostStatus} />
          </div>
          <ShareLink url={buildUrl(domain)} />
        </div>
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

      {data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          <ResultCard className="relative overflow-hidden border-l-2 border-l-cyan-brand/50">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {t("section_domain")}
            </h3>
            <div className="space-y-2 text-sm">
              <Field
                icon={<Globe2 className="h-3 w-3" />}
                label={t("field_name")}
                value={data.domain}
                mono
              />
              <Field
                icon={<Hash className="h-3 w-3" />}
                label={t("field_handle")}
                value={data.handle}
                mono
              />
              <Field
                icon={<Building2 className="h-3 w-3" />}
                label={t("field_registrar")}
                value={data.registrar}
              />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                  {t("field_status")}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {data.status.length === 0 ? (
                    <span className="text-xs text-fg-subtle">—</span>
                  ) : (
                    data.status.map((s) => (
                      <span
                        key={s}
                        className="rounded-md border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
                      >
                        {s}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </ResultCard>

          <ResultCard className="relative overflow-hidden border-l-2 border-l-cyan-brand/50">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {t("dates")}
            </h3>
            <div className="space-y-1.5 text-sm">
              {Object.entries(data.events).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border/50 bg-bg-elevated px-2.5 py-1.5 font-mono text-xs"
                >
                  <span className="text-fg-subtle">{k}</span>
                  <span className="text-fg">
                    {v ? new Date(v).toLocaleDateString() : <span className="text-fg-subtle">—</span>}
                  </span>
                </div>
              ))}
            </div>
          </ResultCard>

          <ResultCard className="relative overflow-hidden border-l-2 border-l-cyan-brand/50 md:col-span-2">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
                <Server className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {t("nameservers")}
              <span className="rounded-md bg-bg-elevated px-2 py-0.5 text-[11px] text-fg-muted ring-1 ring-border">
                {data.nameservers.length}
              </span>
            </h3>
            {data.nameservers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-bg-card/40 px-3 py-3 text-center text-xs text-fg-subtle">
                {tc("no_records")}
              </p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {data.nameservers.map((ns) => (
                  <li
                    key={ns}
                    className="flex items-center gap-2 rounded-lg border border-border/50 bg-bg-elevated px-3 py-1.5 font-mono text-sm text-fg"
                  >
                    <Server className="h-3 w-3 shrink-0 text-cyan-soft" aria-hidden="true" />
                    <span className="truncate">{ns}</span>
                  </li>
                ))}
              </ul>
            )}
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
  mono,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        {icon && <span className="text-cyan-soft/80">{icon}</span>}
        {label}
      </div>
      <div className={`mt-0.5 break-all ${mono ? "font-mono text-sm text-fg" : "text-fg"}`}>
        {value ?? <span className="text-fg-subtle">—</span>}
      </div>
    </div>
  );
}
