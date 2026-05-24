"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe, Zap, AlertCircle } from "lucide-react";
import { api, type DnsResult } from "@/lib/api";
import { isHostname, validateInput } from "@/lib/input-validators";
import { InputStatus } from "@/components/input-status";
import { LoadingButton, ResultCard } from "@/components/tool-shell";
import { SkeletonCard } from "@/components/skeleton";
import { RecentTargets } from "@/components/recent-targets";
import { ShareLink } from "@/components/share-link";
import { useRecentTargets } from "@/lib/use-recent-targets";
import { useDeepLink } from "@/lib/use-deep-link";
import { checkTargetGuard } from "@/lib/target-guard";
import { DetailedRecordList } from "@/app/[locale]/dns-lookup/detailed-record-list";

const TYPES = ["A", "AAAA", "MX", "TXT", "CNAME", "NS", "SOA", "CAA"];

export function DnsClient() {
  const tc = useTranslations("common");
  const tg = useTranslations("guard");
  const tn = useTranslations("nav.tools");
  const td = useTranslations("dns");
  const inputId = useId();
  const [domain, setDomain] = useState("example.com");
  const [selected, setSelected] = useState(new Set(["A", "AAAA", "MX", "TXT", "NS"]));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DnsResult | null>(null);
  const { recent, remember, forget } = useRecentTargets("dns-lookup");
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
    const guard = checkTargetGuard(domain);
    if (!guard.ok) {
      setErr(tg(guard.reasonKey));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try {
      const types = Array.from(selected).join(",");
      setData(await api.dns(domain, types));
      remember(domain);
      pushUrl(domain);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  function toggle(tp: string) {
    const s = new Set(selected);
    if (s.has(tp)) s.delete(tp);
    else s.add(tp);
    setSelected(s);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-4" aria-label={tn("dns")}>
        <label htmlFor={inputId} className="sr-only">
          {tc("enter_domain")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Globe
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
              aria-hidden="true"
            />
            <input
              id={inputId}
              className="input pl-11"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
            />
          </div>
          <LoadingButton loading={loading} loadingLabel={tc("loading")}>
            {tc("lookup")}
          </LoadingButton>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <RecentTargets recent={recent} onPick={setDomain} onForget={forget} />
            <InputStatus result={hostStatus} />
          </div>
          <ShareLink url={buildUrl(domain)} />
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={td("record_types")}
        >
          <span className="self-center text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            {td("record_types")}
          </span>
          {TYPES.map((tp) => {
            const active = selected.has(tp);
            return (
              <button
                key={tp}
                type="button"
                onClick={() => toggle(tp)}
                aria-pressed={active}
                className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold transition ${
                  active
                    ? "border-cyan-brand/50 bg-cyan-brand/10 text-cyan-soft shadow-glow-cyan"
                    : "border-border bg-bg-elevated text-fg-muted hover:border-fg-muted hover:text-fg"
                }`}
              >
                {tp}
              </button>
            );
          })}
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

      {/* Skeleton while the lookup runs and no previous data is on
          screen — keeps the result area at roughly its eventual
          height instead of collapsing to zero and bouncing the page. */}
      {loading && !data && (
        <div className="grid gap-3 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {data && (
        <div className="space-y-4" aria-live="polite">
          {/* Header strip: domain + resolved time */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg-card/60 px-4 py-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-mono text-fg-muted">
              <Globe className="h-3.5 w-3.5 text-cyan-soft" aria-hidden="true" />
              <span className="text-fg">{domain}</span>
            </span>
            <span aria-hidden="true" className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-1.5 text-fg-muted">
              <Zap className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
              <span className="font-mono text-fg">
                {tc("resolved_in", { ms: data.durationMs })}
              </span>
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(data.records).map(([type, values]) => {
              const detailed = data.recordsDetailed?.[type];
              return (
                <ResultCard
                  key={type}
                  className="relative overflow-hidden border-l-2 border-l-cyan-brand/50"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                      <span className="flex h-7 min-w-[2.5rem] items-center justify-center rounded-md bg-cyan-brand/10 px-2 font-mono text-xs font-bold text-cyan-soft ring-1 ring-cyan-brand/25">
                        {type}
                      </span>
                    </h3>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        values.length === 0
                          ? "bg-bg-elevated text-fg-subtle"
                          : "bg-success/10 text-success ring-1 ring-success/20"
                      }`}
                    >
                      {tc("records_count", { count: values.length })}
                    </span>
                  </div>
                  {values.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border bg-bg-card/40 px-3 py-3 text-center text-xs text-fg-subtle">
                      {tc("no_records")}
                    </p>
                  ) : detailed && detailed.length === values.length ? (
                    <DetailedRecordList type={type} entries={detailed} />
                  ) : (
                    <ul className="space-y-1 font-mono text-sm">
                      {values.map((v, i) => (
                        <li
                          key={i}
                          className="rounded-lg border border-border/50 bg-bg-elevated px-3 py-1.5 break-all text-fg"
                        >
                          {v}
                        </li>
                      ))}
                    </ul>
                  )}
                </ResultCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
